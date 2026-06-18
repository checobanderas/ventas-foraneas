import React, { useState, useEffect } from 'react';
import { 
  IonGrid, 
  IonRow, 
  IonCol, 
  IonFab, 
  IonFabButton, 
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent
} from '@ionic/react';
import type { Client, Product, Payment } from '../db/indexedDB';
import { syncService } from '../db/syncService';
import { getLocalProducts, getLocalPayments, saveLocalProduct } from '../db/indexedDB';

interface ClientModuleProps {
  onClientsUpdated: () => void;
  clients: Client[];
  selectedClient: Client | null;
  onSelectClient: (client: Client | null) => void;
}

export const ClientModule: React.FC<ClientModuleProps> = ({
  onClientsUpdated,
  clients,
  selectedClient,
  onSelectClient
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Search & Route Filter
  const [searchText, setSearchText] = useState('');
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      client.name.toLowerCase().includes(searchText.toLowerCase()) ||
      (client.address && client.address.toLowerCase().includes(searchText.toLowerCase())) ||
      (client.phone && client.phone.includes(searchText)) ||
      (client.mysqlId && String(client.mysqlId).includes(searchText));

    const matchesRoute = selectedRoute === null || client.routeId === selectedRoute;

    return matchesSearch && matchesRoute;
  });

  const uniqueRoutes = Array.from(
    new Set(clients.map(c => c.routeId).filter(Boolean).map(r => Number(r)))
  ).sort((a, b) => a - b);

  // Local Products & Sales Cart States
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [activeCartClient, setActiveCartClient] = useState<Client | null>(null);
  const [cartQuantities, setCartQuantities] = useState<{ [productId: string]: number }>({});
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [localPayments, setLocalPayments] = useState<Payment[]>([]);
  const [productSearchText, setProductSearchText] = useState('');
  const [selectedCartCategory, setSelectedCartCategory] = useState<string>('');
  const [cartDiscount, setCartDiscount] = useState<number>(0);

  const loadPayments = async () => {
    try {
      const pmts = await getLocalPayments();
      setLocalPayments(pmts);
    } catch (err) {
      console.error("Error loading payments:", err);
    }
  };

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const prods = await getLocalProducts();
        setLocalProducts(prods);
      } catch (err) {
        console.error("Error loading products:", err);
      }
    };
    loadProducts();
    loadPayments();
  }, [clients]);
  
  // Form States
  const [isEditing, setIsEditing] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNum, setPhoneNum] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [initialBalance, setInitialBalance] = useState<number | null>(null);
  const [initialBalanceDate, setInitialBalanceDate] = useState<string>('');

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Helper to check if client has payments/movements
  const hasMovements = (clientId: string) => {
    return localPayments.some(p => p.clientId === clientId);
  };

  // Load selected client into form when editing is triggered
  useEffect(() => {
    if (selectedClient && isEditing) {
      setId(selectedClient.id);
      setName(selectedClient.name);
      setEmail(selectedClient.email);
      setPhoneNum(selectedClient.phone);
      setAddress(selectedClient.address);
      setLatitude(selectedClient.latitude);
      setLongitude(selectedClient.longitude);
      setInitialBalance(selectedClient.initialBalance !== undefined ? selectedClient.initialBalance : null);
      setInitialBalanceDate(selectedClient.initialBalanceDate || '');
    }
  }, [selectedClient, isEditing]);

  const openAddModal = () => {
    setIsEditing(false);
    clearForm();
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    onSelectClient(client);
    setIsEditing(true);
    setId(client.id);
    setName(client.name);
    setEmail(client.email);
    setPhoneNum(client.phone);
    setAddress(client.address);
    setLatitude(client.latitude);
    setLongitude(client.longitude);
    setInitialBalance(client.initialBalance !== undefined ? client.initialBalance : null);
    setInitialBalanceDate(client.initialBalanceDate || '');
    setIsModalOpen(true);
  };

  const clearForm = () => {
    setId('');
    setName('');
    setEmail('');
    setPhoneNum('');
    setAddress('');
    setLatitude(null);
    setLongitude(null);
    setInitialBalance(null);
    setInitialBalanceDate('');
    setGeoError(null);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalización no soportada por el navegador.');
      return;
    }

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setGeoLoading(false);
      },
      (error) => {
        console.error('Error getting geolocation:', error);
        let errorMsg = 'Error al obtener la ubicación.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Permiso denegado.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Ubicación no disponible.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Tiempo agotado.';
        }
        setGeoError(errorMsg);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      if (isEditing && id) {
        // Edit existing client
        const existing = clients.find(c => c.id === id);
        if (!existing) return;
        
        await syncService.updateClient({
          ...existing,
          name,
          email,
          phone: phoneNum,
          address,
          latitude,
          longitude,
          initialBalance: initialBalance !== null ? Number(initialBalance) : 0,
          initialBalanceDate: initialBalanceDate || null
        });
      } else {
        // Create new client
        const newId = `cli_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await syncService.addClient({
          id: newId,
          name,
          email,
          phone: phoneNum,
          address,
          latitude,
          longitude,
          initialBalance: initialBalance !== null ? Number(initialBalance) : 0,
          initialBalanceDate: initialBalanceDate || null
        });
      }
      setIsModalOpen(false);
      clearForm();
      onClientsUpdated();
    } catch (err) {
      console.error("Error saving client:", err);
    }
  };

  const handleDeleteClick = async (clientId: string) => {
    if (confirm('¿Estás seguro de eliminar este cliente?')) {
      try {
        await syncService.deleteClient(clientId);
        if (selectedClient?.id === clientId) {
          onSelectClient(null);
        }
        onClientsUpdated();
      } catch (err) {
        console.error("Error deleting client:", err);
      }
    }
  };

  const cleanPhone = (p: string) => {
    const digits = p.replace(/\D/g, '');
    if (digits.length === 10) {
      return `52${digits}`;
    }
    return digits;
  };

  const handleRouteToClient = (client: Client) => {
    const destination = (client.latitude !== null && client.longitude !== null)
      ? `${client.latitude},${client.longitude}`
      : (client.address && client.address !== 'Sin Dirección Registrada')
        ? encodeURIComponent(client.address)
        : null;

    if (!destination) return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const url = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${destination}`;
          window.open(url, '_blank');
        },
        (error) => {
          console.warn('Geolocation failed, opening with destination only:', error);
          const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
          window.open(url, '_blank');
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  // Cart Calculations & Confirmation
  const activeClientPayments = activeCartClient 
    ? localPayments.filter(p => p.clientId === activeCartClient.id) 
    : [];
  const clientPaymentsSum = activeClientPayments.reduce((sum, p) => sum + p.amount, 0);
  const activeClientDebt = activeCartClient 
    ? (activeCartClient.initialBalance || 0) + clientPaymentsSum 
    : 0;

  // Extract unique brands/departments currently in the truck
  const cartCategories = Array.from(
    new Set(
      localProducts
        .filter(p => p.truckStock && p.truckStock > 0)
        .map(p => p.brand)
        .filter(Boolean)
    )
  ).sort() as string[];

  const filteredCartProducts = localProducts.filter(prod => {
    // 1. Only show products loaded on the truck
    if (!prod.truckStock || prod.truckStock <= 0) return false;

    // 2. Filter by search term
    const term = productSearchText.toLowerCase();
    const matchesSearch = 
      prod.name.toLowerCase().includes(term) ||
      prod.brand.toLowerCase().includes(term) ||
      prod.sku.toLowerCase().includes(term);

    // 3. Filter by category tab
    const matchesCategory = !selectedCartCategory || prod.brand === selectedCartCategory;

    return matchesSearch && matchesCategory;
  });

  const getCartTotal = () => {
    return Object.entries(cartQuantities).reduce((sum, [productId, qty]) => {
      const prod = localProducts.find(p => p.id === productId);
      return sum + (prod ? prod.price * qty : 0);
    }, 0);
  };

  const updateQuantity = (productId: string, delta: number) => {
    const prod = localProducts.find(p => p.id === productId);
    if (!prod) return;
    const maxStock = prod.truckStock || 0;

    setCartQuantities(prev => {
      const current = prev[productId] || 0;
      const next = current + delta;
      if (next > maxStock) {
        alert(`No puedes vender más de la existencia en la camioneta (${maxStock} ${prod.unit}).`);
        return prev;
      }
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleConfirmSale = async () => {
    if (!activeCartClient) return;

    const subtotal = getCartTotal();
    if (subtotal <= 0) {
      alert("El carrito está vacío. Agrega al menos un producto.");
      return;
    }

    const discountAmount = Number(cartDiscount) || 0;
    if (discountAmount < 0) {
      alert("El descuento no puede ser negativo.");
      return;
    }
    if (discountAmount > subtotal) {
      alert("El descuento no puede ser mayor que el subtotal.");
      return;
    }

    const finalTotal = Math.max(0, subtotal - discountAmount);

    // Double check truck stock validation before finalizing
    for (const [prodId, qty] of Object.entries(cartQuantities)) {
      const prod = localProducts.find(p => p.id === prodId);
      if (!prod || (prod.truckStock || 0) < qty) {
        alert(`Existencias insuficientes para ${prod?.name || prodId} en la camioneta.`);
        return;
      }
    }

    const itemsSold = Object.entries(cartQuantities)
      .map(([prodId, qty]) => {
        const prod = localProducts.find(p => p.id === prodId);
        return prod ? `${qty}x ${prod.name} (${prod.unit})` : '';
      })
      .filter(Boolean);

    try {
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await syncService.addPayment({
        id: paymentId,
        clientId: activeCartClient.id,
        clientName: activeCartClient.name,
        amount: finalTotal,
        date: new Date().toISOString().split('T')[0],
        paymentMethod: paymentMethod,
        status: 'completed',
        notes: `Venta: ${itemsSold.join(', ')}`,
        subtotal: subtotal,
        discount: discountAmount
      });

      // Deduct quantity sold from truck local inventory
      for (const [prodId, qty] of Object.entries(cartQuantities)) {
        const prod = localProducts.find(p => p.id === prodId);
        if (prod) {
          const currentStock = prod.truckStock || 0;
          const nextStock = Math.max(0, currentStock - qty);
          await saveLocalProduct({
            ...prod,
            truckStock: nextStock
          });
        }
      }

      alert(`¡Venta registrada con éxito!\nTotal: $${finalTotal.toFixed(2)}`);
      
      setCartQuantities({});
      setPaymentMethod('cash');
      setProductSearchText('');
      setSelectedCartCategory('');
      setActiveCartClient(null);
      setCartDiscount(0);
      
      await loadPayments();
      onClientsUpdated();
    } catch (err) {
      console.error("Error confirming sale:", err);
      alert("Error al registrar la venta.");
    }
  };

  return (
    <IonGrid style={{ padding: 0 }}>
      {activeCartClient ? (
        <IonRow>
          <IonCol size="12">
            <div className="glass-card" style={{ padding: '1rem' }}>
              {/* Cart Header */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)', margin: 0, wordBreak: 'break-word' }}>
                    🛒 Venta: {activeCartClient.name}
                  </h3>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setCartQuantities({});
                      setActiveCartClient(null);
                    }}
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                  >
                    👥 Volver
                  </button>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--secondary-color)', fontWeight: 600 }}>
                  💵 Nos debe: ${activeClientDebt.toFixed(2)}
                </div>
              </div>

              {/* Product Search Filter */}
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <span style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Buscar producto..."
                  value={productSearchText}
                  onChange={(e) => setProductSearchText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 1.75rem 0.45rem 1.75rem',
                    fontSize: '0.85rem',
                    border: '1px solid var(--card-border)',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.7)',
                    color: 'var(--text-main)',
                    outline: 'none'
                  }}
                />
                {productSearchText && (
                  <button
                    type="button"
                    onClick={() => setProductSearchText('')}
                    style={{
                      position: 'absolute',
                      right: '0.55rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    ❌
                  </button>
                )}
              </div>

              {/* Category Filter Badges */}
              {cartCategories.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.55rem', marginBottom: '0.85rem', WebkitOverflowScrolling: 'touch' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedCartCategory('')}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.75rem',
                      borderRadius: '16px',
                      border: '1px solid var(--card-border)',
                      background: selectedCartCategory === '' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.7)',
                      color: selectedCartCategory === '' ? 'white' : 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    ⭐ Todos
                  </button>
                  {cartCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCartCategory(cat)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.75rem',
                        borderRadius: '16px',
                        border: '1px solid var(--card-border)',
                        background: selectedCartCategory === cat ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.7)',
                        color: selectedCartCategory === cat ? 'white' : 'var(--text-main)',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      🍳 {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Product Catalog Table */}
              <div className="table-responsive" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
                <table className="client-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50%', position: 'sticky', top: 0, zIndex: 10, background: 'hsl(210, 30%, 92%)' }}>Producto</th>
                      <th style={{ width: '20%', textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'hsl(210, 30%, 92%)' }}>Precio</th>
                      <th style={{ width: '30%', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'hsl(210, 30%, 92%)' }}>Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localProducts.filter(p => p.truckStock && p.truckStock > 0).length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--danger-color)', fontSize: '0.85rem' }}>
                          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚚</div>
                          <strong>Tu camioneta está vacía.</strong>
                          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                            Por favor ve al menú lateral y entra a <strong>Mi Camioneta</strong> para cargar inventario antes de realizar ventas.
                          </p>
                        </td>
                      </tr>
                    ) : filteredCartProducts.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          No se encontraron productos en esta categoría o con este término.
                        </td>
                      </tr>
                    ) : (
                      filteredCartProducts.map((prod) => {
                        const qty = cartQuantities[prod.id] || 0;
                        return (
                          <tr key={prod.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                {prod.name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {prod.brand ? `${prod.brand} • ` : ''}{prod.unit}
                              </div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                En Camioneta: {prod.truckStock}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>
                              ${prod.price.toFixed(2)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => updateQuantity(prod.id, -1)}
                                  style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', padding: 0 }}
                                >
                                  ➖
                                </button>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', minWidth: '18px', textAlign: 'center' }}>
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => {
                                    if (qty >= (prod.truckStock || 0)) {
                                      alert("No puedes vender más de lo que traes en la camioneta.");
                                      return;
                                    }
                                    updateQuantity(prod.id, 1);
                                  }}
                                  style={{ width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', padding: 0 }}
                                >
                                  ➕
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Checkout Footer Panel */}
              <div style={{ borderTop: '1px solid var(--card-border)', marginTop: '1rem', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Subtotal:</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      ${getCartTotal().toFixed(2)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Descuento ($):</span>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="0.00"
                      value={cartDiscount || ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value));
                        setCartDiscount(isNaN(val) ? 0 : val);
                      }}
                      style={{
                        width: '90px',
                        padding: '0.2rem 0.4rem',
                        fontSize: '0.85rem',
                        textAlign: 'right',
                        margin: 0
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px dashed var(--card-border)' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>Total a Cobrar:</span>
                    <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary-color)' }}>
                      ${Math.max(0, getCartTotal() - cartDiscount).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Método de Pago</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn ${paymentMethod === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setPaymentMethod('cash')}
                      style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}
                    >
                      💵 Efectivo
                    </button>
                    <button
                      type="button"
                      className={`btn ${paymentMethod === 'card' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setPaymentMethod('card')}
                      style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}
                    >
                      💳 Tarjeta
                    </button>
                    <button
                      type="button"
                      className={`btn ${paymentMethod === 'transfer' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setPaymentMethod('transfer')}
                      style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}
                    >
                      🏦 Transf.
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setCartQuantities({});
                      setActiveCartClient(null);
                    }}
                    style={{ flex: 1 }}
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmSale}
                    disabled={getCartTotal() <= 0}
                    style={{ flex: 2 }}
                  >
                    Confirmar Venta 🛒
                  </button>
                </div>
              </div>
            </div>
          </IonCol>
        </IonRow>
      ) : (
        <IonRow>
          <IonCol size="12">
          <div className="glass-card" style={{ padding: '1rem' }}>
            
            {/* Header controls with Search & Route Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {/* Row 1: Title & Mode Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                  👥 Clientes ({filteredClients.length})
                </h3>
                
                <div className="view-mode-toggle" style={{ margin: 0 }}>
                  <button 
                    type="button"
                    className={`toggle-option-btn ${viewMode === 'table' ? 'active' : ''}`}
                    onClick={() => setViewMode('table')}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    📋 Tabla
                  </button>
                  <button 
                    type="button"
                    className={`toggle-option-btn ${viewMode === 'cards' ? 'active' : ''}`}
                    onClick={() => setViewMode('cards')}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    🎴 Cards
                  </button>
                </div>
              </div>

              {/* Row 2: Compact Search & Route dropdown */}
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
                
                {/* Compact Search Input */}
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 1.75rem 0.45rem 1.75rem',
                      fontSize: '0.85rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.7)',
                      color: 'var(--text-main)',
                      outline: 'none'
                    }}
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      style={{
                        position: 'absolute',
                        right: '0.55rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      ❌
                    </button>
                  )}
                </div>

                {/* Compact Route Filter */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                    🛣️
                  </span>
                  <select
                    value={selectedRoute || ''}
                    onChange={(e) => setSelectedRoute(e.target.value ? Number(e.target.value) : null)}
                    style={{
                      padding: '0.45rem 0.5rem 0.45rem 1.6rem',
                      fontSize: '0.85rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.7)',
                      color: 'var(--text-main)',
                      outline: 'none',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      minWidth: '85px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Rutas</option>
                    {uniqueRoutes.map((route) => (
                      <option key={route} value={route}>
                        Ruta {route}
                      </option>
                    ))}
                  </select>
                </div>

              </div>
            </div>

            {clients.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>👥</div>
                <p>No hay clientes registrados.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Presiona el botón (+) flotante abajo a la derecha para registrar tu primer cliente.</p>
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>🔍</div>
                <p>No se encontraron clientes.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Prueba escribiendo otra cosa o cambiando el filtro de rutas.</p>
              </div>
            ) : viewMode === 'table' ? (
              
              /* TABLE VIEW - Mobile optimized 3-Column layout */
              <div className="table-responsive">
                <table className="client-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45%' }}>Cliente</th>
                      <th style={{ width: '40%' }}>Detalles</th>
                      <th style={{ textAlign: 'center', width: '15%' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => {
                      const isSelected = selectedClient?.id === client.id;
                      const hasPhone = !!client.phone;
                      const hasRoute = (client.latitude !== null && client.longitude !== null) || (!!client.address && client.address !== 'Sin Dirección Registrada');

                      const clientPayments = localPayments.filter(p => p.clientId === client.id);
                      const paymentsSum = clientPayments.reduce((sum, p) => sum + p.amount, 0);
                      const totalBalance = (client.initialBalance || 0) + paymentsSum;

                      return (
                        <tr
                          key={client.id}
                          onClick={() => onSelectClient(client)}
                          style={{
                            background: isSelected ? 'hsla(224, 76%, 54%, 0.12)' : 'transparent',
                            cursor: 'pointer'
                          }}
                        >
                          {/* Column 1: Consolidates Name, Ref ID, Route and Seller */}
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                              {client.name}
                            </div>
                            
                            {/* Subtitle with reference data */}
                            <div style={{ fontSize: '0.75rem', color: 'var(--secondary-color)', fontWeight: 600, marginTop: '0.15rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.5rem' }}>
                              {client.mysqlId && <span>Ref: #{client.mysqlId}</span>}
                              {client.routeId && <span>Ruta: {client.routeId}</span>}
                              {client.sellerId && <span>Vend: {client.sellerId}</span>}
                            </div>
                          </td>
                          
                          {/* Column 2: Consolidates Address, Phone, Email and Sync Tag */}
                          <td>
                            {client.address && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                                🗺️ {client.address}
                              </div>
                            )}
                            
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                              {client.phone && <span>📞 {client.phone}</span>}
                              {client.email && <span style={{ wordBreak: 'break-all' }}>✉️ {client.email}</span>}
                            </div>

                            {/* Local / Cloud Sync Badge & Balance */}
                            <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              {client.syncStatus === 'synced' ? (
                                <span className="sync-indicator-badge synced" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>Nube</span>
                              ) : (
                                <span className="sync-indicator-badge pending" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>Local</span>
                              )}
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: totalBalance > 0 ? 'var(--danger-color)' : 'var(--accent-color)' }}>
                                💰 Saldo: ${totalBalance.toFixed(2)}
                              </span>
                            </div>
                          </td>
                          
                          {/* Column 3: Compact Emoji Actions */}
                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center', justifyContent: 'center' }}>
                              
                              {/* WhatsApp Chat */}
                              <div style={{ display: 'flex', gap: '0.2rem' }}>
                                <a
                                  href={hasPhone ? `https://wa.me/${cleanPhone(client.phone)}` : '#'}
                                  target={hasPhone ? '_blank' : '_self'}
                                  rel="noreferrer"
                                  className={`emoji-action-btn ${hasPhone ? '' : 'disabled'}`}
                                  title="Enviar WhatsApp"
                                  style={{ padding: '0.15rem' }}
                                >
                                  💬
                                </a>

                                {/* Google Maps GPS routing */}
                                <button
                                  type="button"
                                  className={`emoji-action-btn ${hasRoute ? '' : 'disabled'}`}
                                  onClick={() => handleRouteToClient(client)}
                                  disabled={!hasRoute}
                                  title="Ir Allá (Trazar Ruta)"
                                  style={{ padding: '0.15rem', background: 'transparent', border: 'none' }}
                                >
                                  🚗
                                </button>
                              </div>
                              
                              {/* Edit, Delete & Cart */}
                              <div style={{ display: 'flex', gap: '0.2rem' }}>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => { setCartQuantities({}); setPaymentMethod('cash'); setProductSearchText(''); setCartDiscount(0); setActiveCartClient(client); }}
                                  title="Carrito de Ventas"
                                  style={{ padding: '0.15rem' }}
                                >
                                  🛒
                                </button>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => openEditModal(client)}
                                  title="Editar"
                                  style={{ padding: '0.15rem' }}
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleDeleteClick(client.id)}
                                  title="Eliminar"
                                  style={{ padding: '0.15rem' }}
                                >
                                  🗑️
                                </button>
                              </div>

                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              
              /* CARDS VIEW */
              <div className="cards-container">
                {filteredClients.map((client) => {
                  const isSelected = selectedClient?.id === client.id;
                  const hasPhone = !!client.phone;
                  const hasRoute = (client.latitude !== null && client.longitude !== null) || (!!client.address && client.address !== 'Sin Dirección Registrada');

                  const clientPayments = localPayments.filter(p => p.clientId === client.id);
                  const paymentsSum = clientPayments.reduce((sum, p) => sum + p.amount, 0);
                  const totalBalance = (client.initialBalance || 0) + paymentsSum;

                  return (
                    <div
                      key={client.id}
                      className="client-card-item"
                      style={{
                        borderColor: isSelected ? 'var(--primary-color)' : 'var(--card-border)',
                        boxShadow: isSelected ? '0 0 10px rgba(59, 130, 246, 0.2)' : 'none',
                        background: isSelected ? 'hsla(224, 47%, 9%, 0.8)' : 'hsla(224, 47%, 9%, 0.4)',
                        cursor: 'pointer',
                        padding: '0.75rem'
                      }}
                      onClick={() => onSelectClient(client)}
                    >
                      <div className="client-card-info">
                        <div className="client-card-name" style={{ fontSize: '1rem' }}>
                          {client.name}
                          {client.syncStatus === 'synced' ? (
                            <span className="sync-indicator-badge synced" style={{ fontSize: '0.55rem' }}>Nube</span>
                          ) : (
                            <span className="sync-indicator-badge pending" style={{ fontSize: '0.55rem' }}>Local</span>
                          )}
                        </div>

                        {client.mysqlId && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--secondary-color)', fontWeight: 600 }}>
                            Ref: #{client.mysqlId} {client.routeId ? `• Ruta: ${client.routeId}` : ''} {client.sellerId ? `• Vend: ${client.sellerId}` : ''}
                          </div>
                        )}

                        <div className="client-card-meta" style={{ marginTop: '0.2rem', fontSize: '0.75rem' }}>
                          {client.address ? `🗺️ ${client.address}` : '🗺️ Sin dirección registrada'}
                        </div>

                        {(client.phone || client.email) && (
                          <div className="client-card-meta" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', marginTop: '0.2rem', fontSize: '0.75rem' }}>
                            {client.phone && <span>📞 {client.phone}</span>}
                            {client.email && <span>✉️ {client.email}</span>}
                          </div>
                        )}

                        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-main)', borderTop: '1px solid var(--card-border)', paddingTop: '0.35rem' }}>
                          <span style={{ fontWeight: 600 }}>💰 Saldo Inicial:</span> ${(client.initialBalance || 0).toFixed(2)} | <span style={{ fontWeight: 600 }}>Deuda Total:</span> <span style={{ fontWeight: 700, color: totalBalance > 0 ? 'var(--danger-color)' : 'var(--accent-color)' }}>${totalBalance.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className="client-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="emoji-action-btn"
                          onClick={() => { setCartQuantities({}); setPaymentMethod('cash'); setProductSearchText(''); setActiveCartClient(client); }}
                          title="Carrito de Ventas"
                          style={{ background: 'transparent', border: 'none' }}
                        >
                          🛒
                        </button>
                        <a
                          href={hasPhone ? `https://wa.me/${cleanPhone(client.phone)}` : '#'}
                          target={hasPhone ? '_blank' : '_self'}
                          rel="noreferrer"
                          className={`emoji-action-btn ${hasPhone ? '' : 'disabled'}`}
                          title="Enviar WhatsApp"
                        >
                          💬
                        </a>
                        <button
                          type="button"
                          className={`emoji-action-btn ${hasRoute ? '' : 'disabled'}`}
                          onClick={() => handleRouteToClient(client)}
                          disabled={!hasRoute}
                          title="Ir allá (Trazar Ruta)"
                          style={{ background: 'transparent', border: 'none' }}
                        >
                          🚗
                        </button>
                        <button
                          type="button"
                          className="emoji-action-btn"
                          onClick={() => openEditModal(client)}
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="emoji-action-btn"
                          onClick={() => handleDeleteClick(client.id)}
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </IonCol>
      </IonRow>
      )}

      {/* Floating Action Button (FAB) at Bottom-Right for adding new clients */}
      {!activeCartClient && (
        <IonFab vertical="bottom" horizontal="end" slot="fixed" style={{ margin: '1rem', zIndex: 100 }}>
          <IonFabButton onClick={openAddModal} color="primary" style={{ fontSize: '1.5rem', '--box-shadow': 'var(--shadow-lg)' }}>
            ➕
          </IonFabButton>
        </IonFab>
      )}

      {/* Ionic Modal containing the client form */}
      <IonModal isOpen={isModalOpen} onDidDismiss={() => setIsModalOpen(false)}>
        <IonHeader>
          <IonToolbar style={{ '--background': 'hsla(224, 71%, 6%, 0.9)', '--border-color': 'var(--card-border)' }}>
            <IonTitle style={{ fontSize: '1rem', fontWeight: 700 }}>
              {isEditing ? '✏️ Editar Cliente' : '➕ Registrar Cliente'}
            </IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setIsModalOpen(false)} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Cerrar
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent style={{ '--background': 'var(--bg-color)', '--padding-bottom': '2rem' }}>
          <div style={{ padding: '1.25rem' }}>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre del Cliente *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej. Juan Pérez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="Ej. 9511234567"
                  value={phoneNum}
                  onChange={(e) => setPhoneNum(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Correo Electrónico</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="Ej. juan@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Dirección / Localidad</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Ej. Av. Juárez #102, Centro"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Saldo Inicial ($)</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="Ej. 1300"
                  value={initialBalance !== null ? initialBalance : ''}
                  onChange={(e) => setInitialBalance(e.target.value !== '' ? Number(e.target.value) : null)}
                  disabled={id ? hasMovements(id) : false}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fecha del Saldo Inicial</label>
                <input
                  type="date"
                  className="form-control"
                  value={initialBalanceDate}
                  onChange={(e) => setInitialBalanceDate(e.target.value)}
                  disabled={id ? hasMovements(id) : false}
                />
                {id && hasMovements(id) && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--danger-color)', display: 'block', marginTop: '0.25rem' }}>
                    * No se puede editar el saldo inicial porque el cliente ya tiene movimientos.
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Geolocalización (Coordenadas)</label>
                <div className="location-input-group">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Latitud"
                    value={latitude !== null ? latitude.toFixed(6) : ''}
                    readOnly
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Longitud"
                    value={longitude !== null ? longitude.toFixed(6) : ''}
                    readOnly
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '48px', padding: 0, fontSize: '1.2rem' }}
                    title="Capturar Ubicación GPS actual"
                    onClick={handleGetLocation}
                    disabled={geoLoading}
                  >
                    🎯
                  </button>
                </div>
                {geoError && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--danger-color)', display: 'block', marginTop: '0.25rem' }}>
                    {geoError}
                  </span>
                )}
                {latitude !== null && longitude !== null && !geoError && (
                  <div className="location-badge">
                    🎯 Ubicación capturada
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {isEditing ? 'Guardar Cambios' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </IonContent>
      </IonModal>
    </IonGrid>
  );
};

export default ClientModule;
