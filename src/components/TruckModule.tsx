import React, { useState, useEffect } from 'react';
import { 
  IonGrid, 
  IonRow, 
  IonCol,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent
} from '@ionic/react';
import type { Product, User, Truck, Payment, Client } from '../db/indexedDB';
import { saveLocalProduct, getLocalPayments } from '../db/indexedDB';
import { syncService } from '../db/syncService';

interface TruckModuleProps {
  onInventoryUpdated: () => void;
  products: Product[];
  users?: User[];
  trucks?: Truck[];
  clients?: Client[];
  activeSessionUser?: string;
}

export const TruckModule: React.FC<TruckModuleProps> = ({
  onInventoryUpdated,
  products,
  users = [],
  trucks = [],
  clients = [],
  activeSessionUser = 'admin'
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

  // Modals visibility state
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);

  // Sales modal states
  const [selectedCartClient, setSelectedCartClient] = useState<Client | null>(null);
  const [cartQuantities, setCartQuantities] = useState<{ [productId: string]: number }>({});
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [cartDiscount, setCartDiscount] = useState<number>(0);
  const [productSearchText, setProductSearchText] = useState('');
  const [clientSearchText, setClientSearchText] = useState('');

  const [cartProductDiscounts, setCartProductDiscounts] = useState<{ [productId: string]: number }>({});
  const [lastFourDigits, setLastFourDigits] = useState<string>('');

  useEffect(() => {
    setRouteId(localStorage.getItem('active_route_id') || '');
    setTruckPlates(localStorage.getItem('active_truck_plates') || '');
    setDriverName(localStorage.getItem('active_driver_name') || '');
  }, [activeSessionUser]);

  // New Client Registration States (for Truck sales)
  const [showAddClientForm, setShowAddClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientInitialBalance, setNewClientInitialBalance] = useState<number | null>(null);
  const [newClientLatitude, setNewClientLatitude] = useState<number | null>(null);
  const [newClientLongitude, setNewClientLongitude] = useState<number | null>(null);
  const [newClientGeoLoading, setNewClientGeoLoading] = useState(false);
  const [newClientGeoError, setNewClientGeoError] = useState<string | null>(null);

  const clearNewClientForm = () => {
    setNewClientName('');
    setNewClientPhone('');
    setNewClientAddress('');
    setNewClientInitialBalance(null);
    setNewClientLatitude(null);
    setNewClientLongitude(null);
    setNewClientGeoError(null);
    setNewClientGeoLoading(false);
  };

  const handleGetNewClientLocation = () => {
    if (!navigator.geolocation) {
      setNewClientGeoError('Geolocalización no soportada.');
      return;
    }

    setNewClientGeoLoading(true);
    setNewClientGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewClientLatitude(position.coords.latitude);
        setNewClientLongitude(position.coords.longitude);
        setNewClientGeoLoading(false);
      },
      (error) => {
        console.error('Error getting geolocation for new client:', error);
        let errorMsg = 'Error al obtener ubicación.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Permiso denegado.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Ubicación no disponible.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Tiempo agotado.';
        }
        setNewClientGeoError(errorMsg);
        setNewClientGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSaveNewClient = async () => {
    if (!newClientName.trim()) return;

    try {
      const newId = `cli_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const activeRouteIdVal = routeId ? Number(routeId) : null;
      
      const nowStr = new Date().toISOString();
      const newClientObj = {
        id: newId,
        name: newClientName,
        email: '',
        phone: newClientPhone,
        address: newClientAddress || 'Sin Dirección Registrada',
        latitude: newClientLatitude,
        longitude: newClientLongitude,
        initialBalance: newClientInitialBalance !== null ? Number(newClientInitialBalance) : 0,
        initialBalanceDate: new Date().toISOString().split('T')[0],
        routeId: activeRouteIdVal,
        syncStatus: 'pending-create' as const,
        createdAt: nowStr,
        updatedAt: nowStr
      };

      await syncService.addClient(newClientObj);
      
      // Auto-select client to go directly to cart
      setSelectedCartClient(newClientObj);
      setShowAddClientForm(false);
      clearNewClientForm();

      // Refresh parent client states
      onInventoryUpdated();
    } catch (err) {
      console.error("Error registering new client inline:", err);
      alert("Error al registrar el cliente.");
    }
  };

  // Recharge modal states
  const [rechargeQuantities, setRechargeQuantities] = useState<{ [productId: string]: number }>({});
  const [rechargeSearchText, setRechargeSearchText] = useState('');
  const [selectedRechargeBrand, setSelectedRechargeBrand] = useState('');

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

  const selectedTruckObj = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === truckPlates);
  const selectedTruckStatus = selectedTruckObj?.status || 'bodega';
  const isWorkshopLocked = selectedTruckStatus === 'taller';
  const isConfigDisabled = isWorkshopLocked || selectedTruckStatus === 'transito';
  const isLoadAdjustmentDisabled = isWorkshopLocked || selectedTruckStatus === 'transito' || activeSessionUser !== 'admin';

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
    if (!driverName || !truckPlates || !routeId) {
      alert("Por favor selecciona chofer, ruta y placas.");
      return;
    }

    localStorage.setItem('active_route_id', routeId);
    localStorage.setItem('active_truck_plates', truckPlates);
    localStorage.setItem('active_driver_name', driverName);
    
    // Sync status and details of active truck to 'esperando_salida'
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
        status: 'esperando_salida',
        activeDriver: driverName || null,
        activeRoute: routeId || null,
        inventory,
        salesToday: matchedTruck.salesToday !== undefined ? matchedTruck.salesToday : 0
      });
    }
    
    alert('Configuración de la camioneta guardada. La unidad está lista en bodega esperando carga e inventario para dar el banderazo de salida.');
    onInventoryUpdated();
  };

  // Dispatch Unit (Banderazo de Salida)
  const handleBanderazoSalida = async () => {
    if (!driverName || !truckPlates || !routeId) {
      alert("Por favor configura el chofer, ruta y placas de la unidad antes de dar la salida.");
      return;
    }

    // Validate that truck inventory is loaded and greater than zero
    const totalLoadedItems = products.reduce((sum, p) => sum + (p.truckStock || 0), 0);
    if (totalLoadedItems === 0) {
      alert("⚠️ No se puede dar salida a la camioneta con inventario vacío. Carga mercancía en la camioneta antes de partir.");
      return;
    }

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
        activeDriver: driverName,
        activeRoute: routeId,
        inventory,
        salesToday: 0,
        initialLoaded: inventory,
        recharges: {}
      });

      // Confirm settings in localStorage
      localStorage.setItem('active_route_id', routeId);
      localStorage.setItem('active_truck_plates', truckPlates);
      localStorage.setItem('active_driver_name', driverName);

      alert("🚀 ¡Banderazo de salida exitoso! La camioneta ha sido puesta en tránsito y está lista para vender.");
      onInventoryUpdated();
    } else {
      alert("Error: No se encontró la unidad seleccionada.");
    }
  };

  // Populate driver and route state when unit plates dropdown changes
  const handleTruckPlatesChange = (plates: string) => {
    setTruckPlates(plates);
    const matched = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === plates);
    if (matched) {
      setDriverName(matched.activeDriver || '');
      setRouteId(matched.activeRoute || '');
    } else {
      setDriverName('');
      setRouteId('');
    }
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

  const handleOpenSaleModal = () => {
    setSelectedCartClient(null);
    setCartQuantities({});
    setPaymentMethod('cash');
    setCartDiscount(0);
    setProductSearchText('');
    setClientSearchText('');
    setShowAddClientForm(false);
    clearNewClientForm();
    setIsSaleModalOpen(true);
  };

  const handleOpenRechargeModal = () => {
    const initialRecharge: { [prodId: string]: number } = {};
    products.forEach(p => {
      initialRecharge[p.id] = p.truckStock || 0;
    });
    setRechargeQuantities(initialRecharge);
    setRechargeSearchText('');
    setSelectedRechargeBrand('');
    setIsRechargeModalOpen(true);
  };

  const updateQuantity = (productId: string, delta: number) => {
    const prod = products.find(p => p.id === productId);
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

  const getCartTotal = () => {
    return Object.entries(cartQuantities).reduce((sum, [productId, qty]) => {
      const prod = products.find(p => p.id === productId);
      const discount = cartProductDiscounts[productId] || 0;
      const finalPrice = Math.max(0, (prod ? prod.price : 0) - discount);
      return sum + finalPrice * qty;
    }, 0);
  };

  const handleConfirmSale = async () => {
    if (!selectedCartClient) return;

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

    for (const [prodId, qty] of Object.entries(cartQuantities)) {
      const prod = products.find(p => p.id === prodId);
      const maxStock = prod?.truckStock || 0;
      if (!prod || maxStock < qty) {
        alert(`Existencias insuficientes para ${prod?.name || prodId} en la camioneta.`);
        return;
      }
    }

    const itemsSold = Object.entries(cartQuantities)
      .map(([prodId, qty]) => {
        const prod = products.find(p => p.id === prodId);
        const disc = cartProductDiscounts[prodId] || 0;
        return prod ? `${qty}x ${prod.name} (${prod.unit})${disc > 0 ? ` [Desc: $${disc.toFixed(2)}/u]` : ''}` : '';
      })
      .filter(Boolean);

    try {
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await syncService.addPayment({
        id: paymentId,
        clientId: selectedCartClient.id,
        clientName: selectedCartClient.name,
        amount: finalTotal,
        date: new Date().toISOString().split('T')[0],
        paymentMethod: paymentMethod,
        status: 'completed',
        notes: `[Venta Camioneta] Venta: ${itemsSold.join(', ')}`,
        subtotal: subtotal,
        discount: discountAmount,
        driverName: driverName,
        truckPlates: truckPlates,
        routeId: routeId,
        lastFourDigits: (paymentMethod === 'card' || paymentMethod === 'transfer') ? lastFourDigits : null
      });

      // Decrement product truckStock locally
      for (const [prodId, qty] of Object.entries(cartQuantities)) {
        const prod = products.find(p => p.id === prodId);
        if (prod) {
          const currentStock = prod.truckStock || 0;
          const nextStock = Math.max(0, currentStock - qty);
          await saveLocalProduct({
            ...prod,
            truckStock: nextStock
          });
        }
      }

      // Sync active truck inventory and sales
      const matchedTruck = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === truckPlates);
      if (matchedTruck) {
        const updatedInventory = { ...(matchedTruck.inventory || {}) };
        for (const [prodId, qty] of Object.entries(cartQuantities)) {
          if (updatedInventory[prodId] !== undefined) {
            updatedInventory[prodId] = Math.max(0, updatedInventory[prodId] - qty);
          }
        }
        const currentSalesToday = matchedTruck.salesToday || 0;
        const nextSalesToday = currentSalesToday + finalTotal;
        await syncService.updateTruck({
          ...matchedTruck,
          salesToday: nextSalesToday,
          inventory: updatedInventory
        });
      }

      alert(`¡Venta registrada con éxito!\nTotal: $${finalTotal.toFixed(2)}`);
      
      setCartQuantities({});
      setCartProductDiscounts({});
      setPaymentMethod('cash');
      setLastFourDigits('');
      setProductSearchText('');
      setSelectedCartClient(null);
      setCartDiscount(0);
      setIsSaleModalOpen(false);
      onInventoryUpdated();
    } catch (err) {
      console.error("Error confirming sale in TruckModule:", err);
      alert("Error al registrar la venta.");
    }
  };

  const handleConfirmRecharge = async () => {
    const matchedTruck = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === truckPlates);
    if (!matchedTruck) return;

    try {
      const updatedInventory: { [productId: string]: number } = { ...(matchedTruck.inventory || {}) };
      const updatedRecharges = { ...(matchedTruck.recharges || {}) };

      for (const prod of products) {
        const oldStock = prod.truckStock || 0;
        const newStock = rechargeQuantities[prod.id] !== undefined ? rechargeQuantities[prod.id] : oldStock;
        const diff = newStock - oldStock;

        if (diff !== 0) {
          if (diff > 0 && (prod.stock || 0) < diff) {
            alert(`No hay suficiente stock en bodega para recargar ${diff} unidades de ${prod.name}. Stock disponible: ${prod.stock}`);
            return;
          }

          const currentLoaded = prod.truckStockLoaded || 0;
          const currentRecharged = prod.truckStockRecharged || 0;

          const newWarehouseStock = Math.max(0, (prod.stock || 0) - diff);
          const nextRecharged = currentRecharged + diff;
          const nextLoaded = diff > 0 ? currentLoaded + diff : currentLoaded;

          const updatedProd: Product = {
            ...prod,
            truckStock: newStock,
            truckStockLoaded: nextLoaded,
            truckStockRecharged: nextRecharged,
            stock: newWarehouseStock
          };

          await saveLocalProduct(updatedProd);
          await syncService.updateProduct(updatedProd);

          updatedInventory[prod.id] = newStock;
          updatedRecharges[prod.id] = (updatedRecharges[prod.id] || 0) + diff;
        }
      }

      await syncService.updateTruck({
        ...matchedTruck,
        inventory: updatedInventory,
        recharges: updatedRecharges
      });

      alert("¡Recarga e inventario ajustados con éxito!");
      setIsRechargeModalOpen(false);
      onInventoryUpdated();
    } catch (err) {
      console.error("Error committing recharge:", err);
      alert("Error al guardar la recarga de mercancía.");
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

    const matchedTruck = trucks.find(t => `${t.name} (Eco: ${t.ecoNumber})` === truckPlates);
    const initialLoadedMap = matchedTruck?.initialLoaded || {};
    const rechargesMap = matchedTruck?.recharges || {};

    // Calculate inventory difference
    for (const prod of products) {
      const initial = initialLoadedMap[prod.id] || 0;
      const recharges = rechargesMap[prod.id] || 0;

      const totalLoadedFallback = prod.truckStockLoaded || 0;
      const calcInitial = matchedTruck?.initialLoaded ? initial : totalLoadedFallback;
      const calcRecharges = recharges;

      const expectedRemaining = prod.truckStock || 0;
      const sold = Math.max(0, (calcInitial + calcRecharges) - expectedRemaining);
      const physical = physicalCounts[prod.id] !== undefined ? physicalCounts[prod.id] : expectedRemaining;
      const diff = physical - expectedRemaining;

      if (calcInitial > 0 || calcRecharges !== 0 || expectedRemaining > 0 || physical > 0) {
        invDiffList.push({
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          initialLoaded: calcInitial,
          recharges: calcRecharges,
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
        if (
          (prod.truckStock && prod.truckStock > 0) || 
          (prod.truckStockLoaded && prod.truckStockLoaded > 0) ||
          (prod.truckStockRecharged && prod.truckStockRecharged > 0)
        ) {
          await saveLocalProduct({
            ...prod,
            truckStock: 0,
            truckStockLoaded: 0,
            truckStockRecharged: 0
          });
        }
      }

      // Sync active truck status reset
      if (matchedTruck) {
        await syncService.updateTruck({
          ...matchedTruck,
          status: 'bodega',
          activeDriver: null,
          activeRoute: null,
          salesToday: 0,
          inventory: null,
          initialLoaded: null,
          recharges: null
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
          {activeSessionUser !== 'admin' && selectedTruckStatus !== 'transito' ? (
            <IonRow>
              <IonCol size="12">
                <div className="glass-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', border: '1px solid var(--danger-color)', background: 'rgba(239, 68, 68, 0.05)', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                  <h3 style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--danger-color)', margin: '0 0 0.5rem 0' }}>
                    Sin Camioneta Activa en Ruta
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 1.5rem auto', lineHeight: 1.5 }}>
                    No tienes una camioneta asignada en tránsito para tu perfil (<strong>{activeSessionUser}</strong>). Solicita al administrador que registre tu salida y ponga tu camioneta en tránsito desde la oficina para poder realizar ventas.
                  </p>
                </div>
              </IonCol>
            </IonRow>
          ) : (
            <>
              {/* Admin Transit Trucks List Section */}
              {activeSessionUser === 'admin' && (
                <IonRow>
                  <IonCol size="12">
                    <div className="glass-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                      <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: '0 0 0.85rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        🛣️ Camionetas en Ruta (En Tránsito)
                      </h3>
                      {(trucks || []).filter(t => t.status === 'transito').length === 0 ? (
                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                          No hay camionetas en tránsito en este momento.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                          {(trucks || []).filter(t => t.status === 'transito').map(t => {
                            const isActive = truckPlates === `${t.name} (Eco: ${t.ecoNumber})`;
                            return (
                              <div
                                key={t.id}
                                onClick={() => {
                                  setDriverName(t.activeDriver || '');
                                  setRouteId(t.activeRoute || '');
                                  setTruckPlates(`${t.name} (Eco: ${t.ecoNumber})`);
                                }}
                                className="glass-card"
                                style={{
                                  padding: '0.85rem',
                                  border: isActive ? '2px solid var(--primary-color)' : '1px solid var(--card-border)',
                                  background: isActive ? 'rgba(59, 130, 246, 0.05)' : 'var(--card-bg)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.35rem',
                                  position: 'relative'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                    🚚 {t.name} (Eco: {t.ecoNumber})
                                  </span>
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: 'white',
                                    background: 'var(--accent-color)',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px'
                                  }}>
                                    Ruta {t.activeRoute}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  👤 Chofer: <strong>{t.activeDriver}</strong>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  💰 Vendido Hoy: <strong style={{ color: 'var(--primary-color)' }}>${(t.salesToday || 0).toFixed(2)}</strong>
                                </div>
                                
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDriverName(t.activeDriver || '');
                                      setRouteId(t.activeRoute || '');
                                      setTruckPlates(`${t.name} (Eco: ${t.ecoNumber})`);
                                      setTimeout(() => {
                                        handleOpenSaleModal();
                                      }, 50);
                                    }}
                                    style={{
                                      padding: '0.3rem 0.65rem',
                                      fontSize: '0.75rem',
                                      width: 'auto',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem'
                                    }}
                                  >
                                    🛒 Ventas
                                  </button>
                                  
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDriverName(t.activeDriver || '');
                                      setRouteId(t.activeRoute || '');
                                      setTruckPlates(`${t.name} (Eco: ${t.ecoNumber})`);
                                      setTimeout(() => {
                                        handleOpenRechargeModal();
                                      }, 50);
                                    }}
                                    style={{
                                      padding: '0.3rem 0.65rem',
                                      fontSize: '0.75rem',
                                      width: 'auto',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      color: 'var(--accent-color)'
                                    }}
                                  >
                                    🔄 Recarga
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

              {/* TAB 1: Route & Truck Configuration Form */}
              <IonRow>
                <IonCol size="12">
                  <div className="glass-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🚚 Configuración de Camioneta
                  </h3>
                  {truckPlates && (
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: selectedTruckStatus === 'transito' ? 'var(--accent-color)' : selectedTruckStatus === 'esperando_salida' ? 'var(--secondary-color)' : selectedTruckStatus === 'taller' ? 'var(--danger-color)' : 'var(--text-secondary)',
                      background: selectedTruckStatus === 'transito' ? 'rgba(16, 185, 129, 0.15)' : selectedTruckStatus === 'esperando_salida' ? 'rgba(59, 130, 246, 0.15)' : selectedTruckStatus === 'taller' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0,0,0,0.05)',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '6px'
                    }}>
                      {selectedTruckStatus === 'transito' ? '🛣️ En Tránsito' : selectedTruckStatus === 'esperando_salida' ? '⏳ Esperando Salida' : selectedTruckStatus === 'taller' ? '🔧 En Taller (Bloqueada)' : '🏭 Parada en Bodega'}
                    </span>
                  )}
                </div>

                {isWorkshopLocked && (
                  <div className="alert danger" style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', marginBottom: '1rem' }}>
                    ⚠️ Esta unidad está registrada en el taller de mantenimiento. No se puede iniciar ruta ni cargar mercancía.
                  </div>
                )}

                {selectedTruckStatus === 'transito' ? (
                  <div style={{
                    padding: '0.85rem 1.05rem',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.15)',
                    fontSize: '0.85rem',
                    color: 'var(--text-main)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem 2rem',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1rem'
                  }}>
                    <div>
                      👤 <strong>Chofer / Vendedor:</strong> {driverName}
                    </div>
                    <div>
                      🛣️ <strong>Ruta:</strong> Ruta {routeId}
                    </div>
                    <div>
                      🚚 <strong>Placas de Unidad:</strong> {truckPlates}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveConfig}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                      
                      <div className="form-group" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Chofer / Vendedor</label>
                        <select
                          className="form-control"
                          value={driverName}
                          onChange={(e) => setDriverName(e.target.value)}
                          style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                          disabled={isConfigDisabled}
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
                          disabled={isConfigDisabled}
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
                          onChange={(e) => handleTruckPlatesChange(e.target.value)}
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
                        disabled={isConfigDisabled}
                      >
                        Guardar 💾
                      </button>
                    </div>
                  </form>
                )}

                {/* Dispatch Banderazo Button */}
                {(selectedTruckStatus === 'bodega' || selectedTruckStatus === 'esperando_salida') && driverName && truckPlates && routeId && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleBanderazoSalida}
                    style={{
                      background: 'linear-gradient(135deg, #10B981, #059669)',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      padding: '0.65rem 1.25rem',
                      marginTop: '1.25rem',
                      width: '100%',
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    🚀 Dar Banderazo de Salida (Poner en Tránsito)
                  </button>
                )}

                {/* Active Transit Operations: Sell and Recharge buttons */}
                {selectedTruckStatus === 'transito' && (
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                    <button
                      type="button"
                      onClick={handleOpenSaleModal}
                      className="btn btn-primary"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        padding: '0.65rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        boxShadow: '0 4px 6px rgba(59, 130, 246, 0.2)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      🛒 Registrar Venta
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenRechargeModal}
                      className="btn btn-secondary"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #10B981, #059669)',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        padding: '0.65rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      🔄 Registrar Recarga
                    </button>
                  </div>
                )}
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
                    disabled={isLoadAdjustmentDisabled}
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
                                  disabled={isLoadAdjustmentDisabled}
                                >
                                  -10
                                </button>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleAdjustStock(prod, -1)}
                                  style={{ width: '24px', padding: '0.2rem 0', fontSize: '0.75rem' }}
                                  title="Quitar 1"
                                  disabled={isLoadAdjustmentDisabled}
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
                                  disabled={isLoadAdjustmentDisabled}
                                />

                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleAdjustStock(prod, 1)}
                                  style={{ width: '24px', padding: '0.2rem 0', fontSize: '0.75rem' }}
                                  title="Añadir 1"
                                  disabled={isLoadAdjustmentDisabled}
                                >
                                  ➕
                                </button>
                                <button
                                  type="button"
                                  className="emoji-action-btn"
                                  onClick={() => handleAdjustStock(prod, 10)}
                                  style={{ width: '32px', padding: '0.2rem 0', fontSize: '0.7rem' }}
                                  title="Añadir 10"
                                  disabled={isLoadAdjustmentDisabled}
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
          )}
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
                        <th style={{ textAlign: 'center' }}>Carga Inicial</th>
                        <th style={{ textAlign: 'center' }}>Recargas</th>
                        <th style={{ textAlign: 'center' }}>Vendido</th>
                        <th style={{ textAlign: 'center' }}>Sobrante Esp.</th>
                        <th style={{ textAlign: 'center', width: '90px' }}>Físico</th>
                        <th style={{ textAlign: 'center' }}>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products
                        .filter(p => {
                          const initial = (selectedTruckObj?.initialLoaded || {})[p.id] || 0;
                          const recharges = (selectedTruckObj?.recharges || {})[p.id] || 0;
                          const current = p.truckStock || 0;
                          const loaded = p.truckStockLoaded || 0;
                          return initial > 0 || recharges !== 0 || current > 0 || loaded > 0;
                        })
                        .map(prod => {
                          const initial = (selectedTruckObj?.initialLoaded || {})[prod.id] || 0;
                          const recharges = (selectedTruckObj?.recharges || {})[prod.id] || 0;
                          
                          const totalLoadedFallback = prod.truckStockLoaded || 0;
                          const calcInitial = selectedTruckObj?.initialLoaded ? initial : totalLoadedFallback;
                          const calcRecharges = recharges;

                          const expected = prod.truckStock || 0;
                          const sold = Math.max(0, (calcInitial + calcRecharges) - expected);
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
                              <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{calcInitial}</td>
                              <td style={{ textAlign: 'center', fontSize: '0.8rem', color: calcRecharges > 0 ? 'var(--accent-color)' : calcRecharges < 0 ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                                {calcRecharges > 0 ? `+${calcRecharges}` : calcRecharges === 0 ? '0' : calcRecharges}
                              </td>
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
                      {products.filter(p => {
                        const initial = (selectedTruckObj?.initialLoaded || {})[p.id] || 0;
                        const recharges = (selectedTruckObj?.recharges || {})[p.id] || 0;
                        const current = p.truckStock || 0;
                        const loaded = p.truckStockLoaded || 0;
                        return initial > 0 || recharges !== 0 || current > 0 || loaded > 0;
                      }).length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
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
      {/* ================= MODAL DE VENTAS ================= */}
      <IonModal isOpen={isSaleModalOpen} onDidDismiss={() => setIsSaleModalOpen(false)}>
        <IonHeader>
          <IonToolbar style={{ '--background': 'var(--primary-color)', '--color': 'white' }}>
            <IonTitle style={{ fontWeight: 800, fontSize: '1rem' }}>🛒 Registrar Venta - Camioneta</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setIsSaleModalOpen(false)} style={{ '--color': 'white' }}>Cerrar</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ion-padding" style={{ '--background': 'var(--bg-color)' }}>
          <div style={{ padding: '1rem' }}>
            {!selectedCartClient ? (
              showAddClientForm ? (
                <div className="glass-card" style={{ padding: '1.25rem', background: 'white', color: 'black', borderRadius: '12px', border: '1px solid var(--card-border)' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary-color)', margin: '0 0 1.25rem 0' }}>
                    ➕ Registrar Nuevo Cliente (Ruta {routeId || 'N/A'})
                  </h4>
                  
                  <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Nombre del Cliente *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ej. Juan Pérez"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      style={{ fontSize: '0.85rem', padding: '0.45rem', width: '100%', border: '1px solid var(--card-border)', borderRadius: '6px' }}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Teléfono</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="Ej. 9511234567"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      style={{ fontSize: '0.85rem', padding: '0.45rem', width: '100%', border: '1px solid var(--card-border)', borderRadius: '6px' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Dirección / Localidad</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="Ej. Av. Juárez #102, Centro"
                      value={newClientAddress}
                      onChange={(e) => setNewClientAddress(e.target.value)}
                      style={{ fontSize: '0.85rem', padding: '0.45rem', width: '100%', border: '1px solid var(--card-border)', borderRadius: '6px', resize: 'vertical' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '0.85rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Saldo Inicial ($)</label>
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Ej. 0.00"
                      value={newClientInitialBalance !== null ? newClientInitialBalance : ''}
                      onChange={(e) => setNewClientInitialBalance(e.target.value !== '' ? Number(e.target.value) : null)}
                      style={{ fontSize: '0.85rem', padding: '0.45rem', width: '100%', border: '1px solid var(--card-border)', borderRadius: '6px' }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Geolocalización (Coordenadas)</label>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Latitud"
                        value={newClientLatitude !== null ? newClientLatitude.toFixed(6) : ''}
                        style={{ fontSize: '0.85rem', padding: '0.45rem', flex: 1, border: '1px solid var(--card-border)', borderRadius: '6px', background: '#f9f9f9' }}
                        readOnly
                      />
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Longitud"
                        value={newClientLongitude !== null ? newClientLongitude.toFixed(6) : ''}
                        style={{ fontSize: '0.85rem', padding: '0.45rem', flex: 1, border: '1px solid var(--card-border)', borderRadius: '6px', background: '#f9f9f9' }}
                        readOnly
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ width: '38px', height: '38px', padding: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '38px', borderRadius: '6px', cursor: 'pointer' }}
                        title="Capturar Ubicación GPS actual"
                        onClick={handleGetNewClientLocation}
                        disabled={newClientGeoLoading}
                      >
                        🎯
                      </button>
                    </div>
                    {newClientGeoError && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--danger-color)', display: 'block', marginTop: '0.25rem' }}>
                        {newClientGeoError}
                      </span>
                    )}
                    {newClientLatitude !== null && newClientLongitude !== null && !newClientGeoError && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', marginTop: '0.25rem', fontWeight: 600 }}>
                        ✓ Ubicación capturada
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowAddClientForm(false)}
                      style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveNewClient}
                      disabled={!newClientName.trim()}
                      style={{ flex: 1, padding: '0.55rem', fontSize: '0.85rem' }}
                    >
                      Registrar y Vender 🛒
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h4 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)', margin: 0 }}>
                      Selecciona un Cliente ({routeId ? `Ruta ${routeId}` : 'Sin Ruta'}):
                    </h4>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setShowAddClientForm(true);
                        clearNewClientForm();
                      }}
                      style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', borderRadius: '6px' }}
                    >
                      ➕ Registrar Nuevo Cliente
                    </button>
                  </div>
                  
                  {/* Search client input */}
                  <input
                    type="text"
                    placeholder="Buscar cliente por nombre o dirección..."
                    value={clientSearchText}
                    onChange={(e) => setClientSearchText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 1rem',
                      fontSize: '0.85rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      marginBottom: '1rem',
                      background: 'white',
                      color: 'black'
                    }}
                  />

                  <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                    <table className="client-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Dirección</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clients
                          .filter(c => {
                            const term = clientSearchText.toLowerCase();
                            // If search query is entered, bypass route check to allow finding office/unassigned clients
                            const matchesRoute = !term.trim()
                              ? (!routeId || String(c.routeId) === routeId)
                              : true;
                            const matchesSearch = c.name.toLowerCase().includes(term) || (c.address && c.address.toLowerCase().includes(term));
                            return matchesRoute && matchesSearch;
                          })
                          .map(c => (
                            <tr key={c.id}>
                              <td style={{ fontWeight: 600 }}>{c.name}</td>
                              <td style={{ color: 'var(--text-secondary)' }}>{c.address || 'Sin Dirección'}</td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => setSelectedCartClient(c)}
                                  style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', width: 'auto' }}
                                >
                                  Seleccionar
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            ) : (
              <>
                {/* Cart details and Products to sell */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)', margin: 0 }}>
                    Cliente: {selectedCartClient.name}
                  </h4>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedCartClient(null)}
                    style={{ width: 'auto', fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                  >
                    ← Cambiar Cliente
                  </button>
                </div>

                <div style={{ display: 'flex', position: 'relative', marginBottom: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Buscar producto en inventario..."
                    value={productSearchText}
                    onChange={(e) => setProductSearchText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 1rem',
                      fontSize: '0.85rem',
                      border: '1px solid var(--card-border)',
                      borderRadius: '8px',
                      background: 'white',
                      color: 'black'
                    }}
                  />
                </div>

                {/* Products available in truck stock */}
                <div className="table-responsive" style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '1rem' }}>
                  <table className="client-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: 'center', width: '80px' }}>Disponible</th>
                        <th style={{ textAlign: 'center', width: '120px' }}>Vender</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products
                        .filter(p => {
                          const hasStock = p.truckStock && p.truckStock > 0;
                          const term = productSearchText.toLowerCase();
                          const matchesSearch = p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term);
                          return hasStock && matchesSearch;
                        })
                        .map(prod => {
                          const inCart = cartQuantities[prod.id] || 0;
                          const discount = cartProductDiscounts[prod.id] || 0;
                          const finalPrice = Math.max(0, prod.price - discount);
                          return (
                            <tr key={prod.id}>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{prod.name}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                  SKU: #{prod.sku} • Marca: {prod.brand || 'Genérico'} ({prod.unit})
                                </div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                  Precio: {discount > 0 ? (
                                    <>
                                      <span style={{ textDecoration: 'line-through', marginRight: '0.25rem' }}>${prod.price.toFixed(2)}</span>
                                      <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>${finalPrice.toFixed(2)}</span>
                                    </>
                                  ) : (
                                    <span>${prod.price.toFixed(2)}</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.25rem' }}>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Desc unitario ($):</span>
                                  <input
                                    type="number"
                                    placeholder="0.00"
                                    value={cartProductDiscounts[prod.id] || ''}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                                      if (val > prod.price) {
                                        alert("El descuento no puede ser mayor al precio del producto.");
                                        return;
                                      }
                                      setCartProductDiscounts(prev => ({
                                        ...prev,
                                        [prod.id]: val
                                      }));
                                    }}
                                    style={{
                                      width: '60px',
                                      fontSize: '0.75rem',
                                      padding: '0.1rem 0.25rem',
                                      border: '1px solid var(--card-border)',
                                      borderRadius: '4px',
                                      textAlign: 'right'
                                    }}
                                  />
                                </div>
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 600 }}>{prod.truckStock}</td>
                              <td style={{ textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                  <button
                                    type="button"
                                    className="emoji-action-btn"
                                    onClick={() => updateQuantity(prod.id, -1)}
                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                                  >
                                    ➖
                                  </button>
                                  <span style={{ minWidth: '20px', fontWeight: 700 }}>{inCart}</span>
                                  <button
                                    type="button"
                                    className="emoji-action-btn"
                                    onClick={() => updateQuantity(prod.id, 1)}
                                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                                  >
                                    ➕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      {products.filter(p => p.truckStock && p.truckStock > 0).length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                            No hay productos cargados en esta camioneta.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Payment Method */}
                <div style={{ background: 'rgba(0,0,0,0.03)', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <span>Subtotal:</span>
                    <span style={{ fontWeight: 700 }}>
                      ${getCartTotal().toFixed(2)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span>Descuento ($):</span>
                    <input
                      type="number"
                      value={cartDiscount}
                      onChange={(e) => setCartDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      style={{ width: '80px', padding: '0.25rem', fontSize: '0.8rem', textAlign: 'right', border: '1px solid var(--card-border)', borderRadius: '4px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 800, borderTop: '1px solid var(--card-border)', paddingTop: '0.5rem', marginBottom: '0.75rem', color: 'var(--primary-color)' }}>
                    <span>Total a Cobrar:</span>
                    <span>
                      ${Math.max(0, getCartTotal() - cartDiscount).toFixed(2)}
                    </span>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Método de Pago:</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="form-control"
                      style={{ fontSize: '0.8rem', padding: '0.3rem' }}
                    >
                      <option value="cash">Efectivo 💵</option>
                      <option value="card">Tarjeta 💳</option>
                      <option value="transfer">Transferencia 🏦</option>
                    </select>
                  </div>

                  {(paymentMethod === 'card' || paymentMethod === 'transfer') && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                        Últimos 4 dígitos ({paymentMethod === 'card' ? 'Tarjeta' : 'Transferencia'}) *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 1234"
                        maxLength={4}
                        value={lastFourDigits}
                        onChange={(e) => setLastFourDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        style={{
                          width: '100%',
                          fontSize: '0.8rem',
                          padding: '0.35rem',
                          border: '1px solid var(--card-border)',
                          borderRadius: '4px',
                          background: 'white',
                          color: 'black'
                        }}
                        required
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmSale}
                    disabled={getCartTotal() <= 0 || ((paymentMethod === 'card' || paymentMethod === 'transfer') && lastFourDigits.length !== 4)}
                    style={{ width: '100%', padding: '0.6rem', fontWeight: 700 }}
                  >
                    Confirmar Venta 💵
                  </button>
                </div>
              </>
            )}
          </div>
        </IonContent>
      </IonModal>

      {/* ================= MODAL DE RECARGAS ================= */}
      <IonModal isOpen={isRechargeModalOpen} onDidDismiss={() => setIsRechargeModalOpen(false)}>
        <IonHeader>
          <IonToolbar style={{ '--background': 'var(--accent-color)', '--color': 'white' }}>
            <IonTitle style={{ fontWeight: 800, fontSize: '1rem' }}>🔄 Registrar Recarga / Ajustes</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setIsRechargeModalOpen(false)} style={{ '--color': 'white' }}>Cerrar</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ion-padding" style={{ '--background': 'var(--bg-color)' }}>
          <div style={{ padding: '1rem' }}>
            <h4 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--text-main)' }}>
              Ajustar inventario actual de la camioneta:
            </h4>

            {/* Filter and Search controls */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Buscar producto por nombre o SKU..."
                value={rechargeSearchText}
                onChange={(e) => setRechargeSearchText(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.85rem',
                  border: '1px solid var(--card-border)',
                  borderRadius: '8px',
                  background: 'white',
                  color: 'black'
                }}
              />
              <select
                value={selectedRechargeBrand}
                onChange={(e) => setSelectedRechargeBrand(e.target.value)}
                style={{
                  padding: '0.45rem',
                  fontSize: '0.85rem',
                  border: '1px solid var(--card-border)',
                  borderRadius: '8px',
                  background: 'white',
                  color: 'black',
                  minWidth: '100px'
                }}
              >
                <option value="">Marcas</option>
                {uniqueBrands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div className="table-responsive" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', marginBottom: '1.25rem' }}>
              <table className="client-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th style={{ textAlign: 'center', width: '60px' }}>Bodega</th>
                    <th style={{ textAlign: 'center', width: '60px' }}>Actual</th>
                    <th style={{ textAlign: 'center', width: '130px' }}>Nuevo Stock Camioneta</th>
                    <th style={{ textAlign: 'center', width: '60px' }}>Ajuste</th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter(prod => {
                      const matchesSearch = 
                        prod.name.toLowerCase().includes(rechargeSearchText.toLowerCase()) ||
                        prod.sku.toLowerCase().includes(rechargeSearchText.toLowerCase());
                      const matchesBrand = !selectedRechargeBrand || prod.brand === selectedRechargeBrand;
                      return matchesSearch && matchesBrand;
                    })
                    .map(prod => {
                      const oldStock = prod.truckStock || 0;
                      const newStock = rechargeQuantities[prod.id] !== undefined ? rechargeQuantities[prod.id] : oldStock;
                      const diff = newStock - oldStock;

                      const handleAdjust = (val: number) => {
                        const next = Math.max(0, newStock + val);
                        setRechargeQuantities(prev => ({
                          ...prev,
                          [prod.id]: next
                        }));
                      };

                      return (
                        <tr key={prod.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{prod.name}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>SKU: #{prod.sku}</div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{prod.stock}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{oldStock}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
                              <button
                                type="button"
                                className="emoji-action-btn"
                                onClick={() => handleAdjust(-10)}
                                style={{ padding: '0.15rem 0.35rem', fontSize: '0.65rem' }}
                              >
                                -10
                              </button>
                              <button
                                type="button"
                                className="emoji-action-btn"
                                onClick={() => handleAdjust(-1)}
                                style={{ padding: '0.15rem 0.35rem', fontSize: '0.65rem' }}
                              >
                                ➖
                              </button>
                              <input
                                type="number"
                                value={newStock}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                  setRechargeQuantities(prev => ({
                                    ...prev,
                                    [prod.id]: isNaN(val) ? 0 : Math.max(0, val)
                                  }));
                                }}
                                style={{
                                  width: '40px',
                                  padding: '0.2rem',
                                  textAlign: 'center',
                                  fontSize: '0.8rem',
                                  border: '1px solid var(--card-border)',
                                  borderRadius: '4px',
                                  background: 'white',
                                  color: 'black'
                                }}
                              />
                              <button
                                type="button"
                                className="emoji-action-btn"
                                onClick={() => handleAdjust(1)}
                                style={{ padding: '0.15rem 0.35rem', fontSize: '0.65rem' }}
                              >
                                ➕
                              </button>
                              <button
                                type="button"
                                className="emoji-action-btn"
                                onClick={() => handleAdjust(10)}
                                style={{ padding: '0.15rem 0.35rem', fontSize: '0.65rem' }}
                              >
                                +10
                              </button>
                            </div>
                          </td>
                          <td style={{ 
                            textAlign: 'center', 
                            fontWeight: 700, 
                            color: diff === 0 ? 'var(--text-secondary)' : diff > 0 ? 'var(--accent-color)' : 'var(--danger-color)'
                          }}>
                            {diff === 0 ? '--' : diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirmRecharge}
              style={{
                width: '100%',
                padding: '0.65rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #10B981, #059669)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Confirmar Guardar Recarga / Ajustes 💾
            </button>
          </div>
        </IonContent>
      </IonModal>
    </IonGrid>
  );
};

export default TruckModule;
