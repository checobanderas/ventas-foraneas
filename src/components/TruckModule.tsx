import React, { useState, useEffect } from 'react';
import { 
  IonGrid, 
  IonRow, 
  IonCol
} from '@ionic/react';
import type { Product, User, Truck, Payment } from '../db/indexedDB';
import { saveLocalProduct, getLocalPayments } from '../db/indexedDB';
import { syncService } from '../db/syncService';

interface TruckModuleProps {
  onInventoryUpdated: () => void;
  products: Product[];
  users?: User[];
  trucks?: Truck[];
}

export const TruckModule: React.FC<TruckModuleProps> = ({
  onInventoryUpdated,
  products,
  users = [],
  trucks = []
}) => {
  // Tabs Layout State
  const [activeTab, setActiveTab] = useState<'inventory' | 'cut'>('inventory');

  // Configuration States (saved in LocalStorage)
  const [routeId, setRouteId] = useState<string>(localStorage.getItem('active_route_id') || '');
  const [truckPlates, setTruckPlates] = useState<string>(localStorage.getItem('active_truck_plates') || '');
  const [driverName, setDriverName] = useState<string>(localStorage.getItem('active_driver_name') || '');

  // Payments / Sales States (for Tab 2: Corte)
  const [payments, setPayments] = useState<Payment[]>([]);
  const [physicalCounts, setPhysicalCounts] = useState<{ [prodId: string]: number }>({});

  // Search & Brand Filter
  const [searchText, setSearchText] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');

  const loadPayments = async () => {
    try {
      const pmts = await getLocalPayments();
      // Filter payments that belong to today's date
      const todayStr = new Date().toISOString().split('T')[0];
      const todayPmts = pmts.filter(p => p.date === todayStr);
      setPayments(todayPmts);
    } catch (err) {
      console.error("Error loading payments in TruckModule:", err);
    }
  };

  useEffect(() => {
    if (activeTab === 'cut') {
      loadPayments();
    }
  }, [activeTab]);

  const filteredProducts = products.filter(prod => {
    const matchesSearch = 
      prod.name.toLowerCase().includes(searchText.toLowerCase()) ||
      prod.sku.toLowerCase().includes(searchText.toLowerCase()) ||
      (prod.brand && prod.brand.toLowerCase().includes(searchText.toLowerCase()));

    const matchesBrand = !selectedBrand || prod.brand === selectedBrand;

    return matchesSearch && matchesBrand;
  });

  const uniqueBrands = Array.from(
    new Set(products.map(p => p.brand).filter(Boolean))
  ).sort() as string[];

  const updateActiveTruckInventory = async (updatedProducts: Product[]) => {
    if (!truckPlates) return;
    const matchedTruck = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === truckPlates);
    if (matchedTruck) {
      const inventory: { [productId: string]: number } = {};
      updatedProducts.forEach(p => {
        if (p.truckStock && p.truckStock > 0) {
          inventory[p.id] = p.truckStock;
        }
      });
      await syncService.updateTruck({
        ...matchedTruck,
        inventory
      });
    }
  };

  // Save config changes to localStorage
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('active_route_id', routeId);
    localStorage.setItem('active_truck_plates', truckPlates);
    localStorage.setItem('active_driver_name', driverName);
    
    // Sync status and details of active truck
    const matchedTruck = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === truckPlates);
    if (matchedTruck) {
      const inventory: { [productId: string]: number } = {};
      products.forEach(p => {
        if (p.truckStock && p.truckStock > 0) {
          inventory[p.id] = p.truckStock;
        }
      });
      await syncService.updateTruck({
        ...matchedTruck,
        status: 'transito',
        activeDriver: driverName || null,
        activeRoute: routeId || null,
        inventory,
        salesToday: matchedTruck.salesToday !== undefined ? matchedTruck.salesToday : 0
      });
    }
    
    alert('Configuración de la camioneta guardada con éxito.');
    onInventoryUpdated();
  };

  // Adjust Truck Stock & Loaded stock
  const handleAdjustStock = async (prod: Product, quantity: number) => {
    const currentStock = prod.truckStock || 0;
    const nextStock = Math.max(0, currentStock + quantity);
    
    const loadedDiff = nextStock - currentStock;
    const currentLoaded = prod.truckStockLoaded || 0;
    const nextLoaded = loadedDiff > 0 ? currentLoaded + loadedDiff : currentLoaded;

    const updated = {
      ...prod,
      truckStock: nextStock,
      truckStockLoaded: nextLoaded
    };
    
    await saveLocalProduct(updated);
    
    // Update synced truck
    const updatedProducts = products.map(p => p.id === prod.id ? updated : p);
    await updateActiveTruckInventory(updatedProducts);

    onInventoryUpdated();
  };

  const handleDirectStockChange = async (prod: Product, val: string) => {
    const nextStock = val === '' ? 0 : Math.max(0, parseInt(val, 10));
    if (isNaN(nextStock)) return;

    const currentStock = prod.truckStock || 0;
    const loadedDiff = nextStock - currentStock;
    const currentLoaded = prod.truckStockLoaded || 0;
    const nextLoaded = loadedDiff > 0 ? currentLoaded + loadedDiff : currentLoaded;

    const updated = {
      ...prod,
      truckStock: nextStock,
      truckStockLoaded: nextLoaded
    };
    
    await saveLocalProduct(updated);
    
    // Update synced truck
    const updatedProducts = products.map(p => p.id === prod.id ? updated : p);
    await updateActiveTruckInventory(updatedProducts);

    onInventoryUpdated();
  };

  // Quick reset all truck stock to 0
  const handleClearTruckStock = async () => {
    if (confirm('¿Estás seguro de vaciar todo el inventario de la camioneta?')) {
      const updatedProducts: Product[] = [];
      for (const prod of products) {
        if ((prod.truckStock && prod.truckStock > 0) || (prod.truckStockLoaded && prod.truckStockLoaded > 0)) {
          const updated = {
            ...prod,
            truckStock: 0,
            truckStockLoaded: 0
          };
          await saveLocalProduct(updated);
          updatedProducts.push(updated);
        } else {
          updatedProducts.push(prod);
        }
      }
      await updateActiveTruckInventory(updatedProducts);
      onInventoryUpdated();
      alert('Inventario de la camioneta vaciado.');
    }
  };

  // Tab 2: Corte calculations
  const getCorteSalesSummary = () => {
    return payments.reduce((acc, p) => {
      acc.totalSales += p.amount;
      acc.totalDiscounts += p.discount || 0;
      if (p.paymentMethod === 'cash') acc.totalCash += p.amount;
      else if (p.paymentMethod === 'card') acc.totalCard += p.amount;
      else if (p.paymentMethod === 'transfer') acc.totalTransfer += p.amount;
      return acc;
    }, {
      totalSales: 0,
      totalCash: 0,
      totalCard: 0,
      totalTransfer: 0,
      totalDiscounts: 0
    });
  };

  const handleCloseCorte = async () => {
    if (!driverName || !truckPlates) {
      alert("Por favor configura un chofer y una unidad antes de realizar el corte.");
      return;
    }

    if (!confirm('¿Estás seguro de que deseas cerrar el corte diario de la camioneta? Esto restablecerá el inventario a cero y limpiará la configuración del chofer.')) {
      return;
    }

    const summary = getCorteSalesSummary();
    const invDiffList: any[] = [];

    // Calculate inventory difference
    for (const prod of products) {
      const loaded = prod.truckStockLoaded || 0;
      const expectedRemaining = prod.truckStock || 0;
      const sold = Math.max(0, loaded - expectedRemaining);
      const physical = physicalCounts[prod.id] !== undefined ? physicalCounts[prod.id] : expectedRemaining;
      const diff = physical - expectedRemaining;

      if (loaded > 0 || expectedRemaining > 0 || physical > 0) {
        invDiffList.push({
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          loaded,
          sold,
          expectedRemaining,
          physical,
          difference: diff
        });
      }
    }

    try {
      const cutId = `cut_${Date.now()}`;
      await syncService.addTruckCut({
        id: cutId,
        driverName: driverName,
        truckPlates: truckPlates,
        routeId: routeId || 'N/A',
        date: new Date().toISOString().split('T')[0],
        totalSales: summary.totalSales,
        totalCash: summary.totalCash,
        totalCard: summary.totalCard,
        totalTransfer: summary.totalTransfer,
        totalDiscounts: summary.totalDiscounts,
        inventoryDiff: JSON.stringify(invDiffList),
        closedAt: new Date().toISOString()
      });

      // Reset all stocks to 0
      for (const prod of products) {
        if ((prod.truckStock && prod.truckStock > 0) || (prod.truckStockLoaded && prod.truckStockLoaded > 0)) {
          await saveLocalProduct({
            ...prod,
            truckStock: 0,
            truckStockLoaded: 0
          });
        }
      }

      // Sync active truck status reset
      const matchedTruck = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === truckPlates);
      if (matchedTruck) {
        await syncService.updateTruck({
          ...matchedTruck,
          status: 'bodega',
          activeDriver: null,
          activeRoute: null,
          salesToday: 0,
          inventory: null
        });
      }

      // Clear local config
      localStorage.removeItem('active_route_id');
      localStorage.removeItem('active_truck_plates');
      localStorage.removeItem('active_driver_name');
      setRouteId('');
      setTruckPlates('');
      setDriverName('');
      setPhysicalCounts({});

      alert("¡Corte cerrado con éxito!\nEl inventario se ha restablecido y el registro de corte se ha enviado para sincronización.");
      onInventoryUpdated();
      setActiveTab('inventory');
    } catch (err) {
      console.error("Error closing corte:", err);
      alert("Error al intentar cerrar el corte.");
    }
  };

  const corteSummary = getCorteSalesSummary();

  return (
    <IonGrid style={{ padding: 0 }}>
      {/* Tabs Menu Navigation */}
      <IonRow>
        <IonCol size="12">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              className={`category-pill ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventory')}
              style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}
            >
              🚚 Carga & Inventario
            </button>
            <button
              type="button"
              className={`category-pill ${activeTab === 'cut' ? 'active' : ''}`}
              onClick={() => setActiveTab('cut')}
              style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}
            >
              🏁 Corte de Caja y Mercancía
            </button>
          </div>
        </IonCol>
      </IonRow>

      {activeTab === 'inventory' ? (
        <>
          {/* TAB 1: Route & Truck Configuration Form */}
          <IonRow>
            <IonCol size="12">
              <div className="glass-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🚚 Configuración de Camioneta
                </h3>

                <form onSubmit={handleSaveConfig}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    
                    <div className="form-group" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Chofer / Vendedor</label>
                      <select
                        className="form-control"
                        value={driverName}
                        onChange={(e) => setDriverName(e.target.value)}
                        style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                      >
                        <option value="">Seleccionar Chofer</option>
                        {users
                          .filter(u => u.role === 'driver' && u.isActive)
                          .map(u => (
                            <option key={u.id} value={u.name}>
                              {u.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: '0 0 120px', marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Ruta Asignada</label>
                      <select
                        className="form-control"
                        value={routeId}
                        onChange={(e) => setRouteId(e.target.value)}
                        style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                      >
                        <option value="">Seleccionar</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                          <option key={r} value={String(r)}>Ruta {r}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: '0 0 180px', marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Placas de Unidad</label>
                      <select
                        className="form-control"
                        value={truckPlates}
                        onChange={(e) => setTruckPlates(e.target.value)}
                        style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                      >
                        <option value="">Seleccionar Unidad</option>
                        {trucks.map(t => (
                          <option key={t.id} value={`${t.name} (Eco: ${t.ecoNumber})`}>
                            {t.name} (Eco: {t.ecoNumber})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      style={{ width: 'auto', padding: '0.55rem 1rem', fontSize: '0.85rem', height: '38px' }}
                    >
                      Guardar 💾
                    </button>
                  </div>
                </form>
              </div>
            </IonCol>
          </IonRow>

          {/* Section 2: Truck Inventory Loading */}
          <IonRow>
            <IonCol size="12">
              <div className="glass-card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                    📦 Carga de Inventario a Camioneta
                  </h3>
                  
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleClearTruckStock}
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem', color: 'var(--danger-color)' }}
                  >
                    🗑️ Vaciar Camioneta
                  </button>
                </div>

                {/* Filter and Search controls */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                      🔍
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar producto..."
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
                  </div>

                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                      🏷️
                    </span>
                    <select
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                      style={{
                        padding: '0.45rem 0.5rem 0.45rem 1.6rem',
                        fontSize: '0.85rem',
                        border: '1px solid var(--card-border)',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.7)',
                        color: 'var(--text-main)',
                        outline: 'none',
                        appearance: 'none',
                        minWidth: '95px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Marcas</option>
                      {uniqueBrands.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Inventory table */}
                <div className="table-responsive" style={{ maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' }}>
                  <table className="client-table">
                    <thead>
                      <tr>
                        <th style={{ width: '45%', position: 'sticky', top: 0, zIndex: 10, background: 'hsl(210, 30%, 92%)' }}>Producto</th>
                        <th style={{ width: '15%', textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'hsl(210, 30%, 92%)' }}>Dispon.</th>
                        <th style={{ width: '40%', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'hsl(210, 30%, 92%)' }}>Cargar en Camioneta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((prod) => {
                        const loadedStock = prod.truckStock || 0;
                        return (
                          <tr key={prod.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                                {prod.name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                SKU: #{prod.sku} • Marca: {prod.brand || 'Genérico'} ({prod.unit})
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {prod.stock}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleAdjustStock(prod, -10)}
                                  style={{ width: '32px', padding: '0.2rem 0', fontSize: '0.7rem' }}
                                  title="Quitar 10"
                                >
                                  -10
                                </button>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleAdjustStock(prod, -1)}
                                  style={{ width: '24px', padding: '0.2rem 0', fontSize: '0.75rem' }}
                                  title="Quitar 1"
                                >
                                  ➖
                                </button>
                                
                                <input
                                  type="number"
                                  value={loadedStock}
                                  onChange={(e) => handleDirectStockChange(prod, e.target.value)}
                                  style={{
                                    width: '48px',
                                    padding: '0.3rem',
                                    textAlign: 'center',
                                    fontSize: '0.85rem',
                                    border: '1px solid var(--card-border)',
                                    borderRadius: '4px',
                                    background: 'white',
                                    color: 'black'
                                  }}
                                />

                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleAdjustStock(prod, 1)}
                                  style={{ width: '24px', padding: '0.2rem 0', fontSize: '0.75rem' }}
                                  title="Añadir 1"
                                >
                                  ➕
                                </button>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleAdjustStock(prod, 10)}
                                  style={{ width: '32px', padding: '0.2rem 0', fontSize: '0.7rem' }}
                                  title="Añadir 10"
                                >
                                  +10
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                            No se encontraron productos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </IonCol>
          </IonRow>
        </>
      ) : (
        <>
          {/* TAB 2: CORTE DIARIO (End of Day Cut) */}
          <IonRow>
            <IonCol size="12">
              <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🏁 Cierre de Corte Diario
                </h3>

                {driverName && truckPlates ? (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.03)', fontSize: '0.85rem' }}>
                    👤 <strong>Chofer:</strong> {driverName} | 🚚 <strong>Unidad:</strong> {truckPlates} {routeId ? `| 🛣️ Ruta: ${routeId}` : ''}
                  </div>
                ) : (
                  <div className="alert danger" style={{ fontSize: '0.8rem', padding: '0.65rem', marginBottom: '1rem' }}>
                    ⚠️ Configura un chofer y unidad en la pestaña "Cargar & Inventario" antes de realizar el corte.
                  </div>
                )}

                {/* Sales financial summary */}
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', margin: '1rem 0 0.5rem 0' }}>
                  💰 Cobranza Realizada Hoy
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  
                  <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Efectivo 💵</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-color)' }}>
                      ${corteSummary.totalCash.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Tarjeta 💳</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary-color)' }}>
                      ${corteSummary.totalCard.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Transferencia 🏦</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--secondary-color)' }}>
                      ${corteSummary.totalTransfer.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.5)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Descuentos 🏷️</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--danger-color)' }}>
                      ${corteSummary.totalDiscounts.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ background: 'var(--primary-color)', color: '#fff', padding: '0.75rem', borderRadius: '8px', gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Total Entregado / Cobrado:</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                      ${corteSummary.totalSales.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Inventory reconciliation summary */}
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', margin: '1rem 0 0.5rem 0' }}>
                  📦 Conciliación de Mercancía
                </h4>
                
                <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                  <table className="client-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: 'center' }}>Cargado</th>
                        <th style={{ textAlign: 'center' }}>Vendido</th>
                        <th style={{ textAlign: 'center' }}>Sobrante Esp.</th>
                        <th style={{ textAlign: 'center', width: '90px' }}>Físico</th>
                        <th style={{ textAlign: 'center' }}>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products
                        .filter(p => (p.truckStockLoaded && p.truckStockLoaded > 0) || (p.truckStock && p.truckStock > 0))
                        .map(prod => {
                          const loaded = prod.truckStockLoaded || 0;
                          const expected = prod.truckStock || 0;
                          const sold = Math.max(0, loaded - expected);
                          const physical = physicalCounts[prod.id] !== undefined ? physicalCounts[prod.id] : expected;
                          const diff = physical - expected;

                          return (
                            <tr key={prod.id}>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-main)' }}>
                                  {prod.name}
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                  SKU: #{prod.sku} ({prod.unit})
                                </div>
                              </td>
                              <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{loaded}</td>
                              <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{sold}</td>
                              <td style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 600 }}>{expected}</td>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="number"
                                  value={physical}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                    setPhysicalCounts(prev => ({
                                      ...prev,
                                      [prod.id]: isNaN(val) ? 0 : val
                                    }));
                                  }}
                                  style={{
                                    width: '60px',
                                    padding: '0.2rem',
                                    textAlign: 'center',
                                    fontSize: '0.8rem',
                                    border: '1px solid var(--card-border)',
                                    borderRadius: '4px',
                                    background: 'white',
                                    color: 'black'
                                  }}
                                />
                              </td>
                              <td style={{ 
                                textAlign: 'center', 
                                fontSize: '0.8rem', 
                                fontWeight: 700,
                                color: diff === 0 ? 'var(--text-secondary)' : diff > 0 ? 'var(--accent-color)' : 'var(--danger-color)' 
                              }}>
                                {diff === 0 ? '✓ Ok' : diff > 0 ? `+${diff}` : diff}
                              </td>
                            </tr>
                          );
                        })}
                      {products.filter(p => (p.truckStockLoaded && p.truckStockLoaded > 0) || (p.truckStock && p.truckStock > 0)).length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No hay productos cargados en la camioneta hoy.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Final Closing Action Button */}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCloseCorte}
                  disabled={!driverName || !truckPlates}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem', fontWeight: 700 }}
                >
                  🔒 Cerrar Corte Diario y Resetear Inventario
                </button>
              </div>
            </IonCol>
          </IonRow>
        </>
      )}
    </IonGrid>
  );
};

export default TruckModule;
