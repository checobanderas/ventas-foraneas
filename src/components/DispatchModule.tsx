import React, { useState, useEffect } from 'react';
import { 
  IonGrid, 
  IonRow, 
  IonCol
} from '@ionic/react';
import type { Truck, Product, User } from '../db/indexedDB';
import { saveLocalProduct } from '../db/indexedDB';
import { syncService } from '../db/syncService';

interface DispatchModuleProps {
  trucks: Truck[];
  products: Product[];
  users: User[];
  onTrucksUpdated: () => void;
  onProductsUpdated: () => void;
  activeSessionUser?: string;
}

export const DispatchModule: React.FC<DispatchModuleProps> = ({
  trucks,
  products,
  users,
  onTrucksUpdated,
  onProductsUpdated,
  activeSessionUser = 'admin'
}) => {
  // Wizard state: 1 = Assignment, 2 = Load Inventory, 3 = Confirm/Dispatch
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Selection states (for Step 1)
  const [selectedTruckId, setSelectedTruckId] = useState<string>('');
  const [selectedDriverName, setSelectedDriverName] = useState<string>('');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');

  // Step 2 loading quantities: { [prodId: string]: number }
  const [loadQuantities, setLoadQuantities] = useState<{ [productId: string]: number }>({});
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('Todos');
  const [productSearchText, setProductSearchText] = useState<string>('');

  // Load configuration if a truck is already waiting for dispatch
  useEffect(() => {
    if (selectedTruckId) {
      const truck = trucks.find(t => t.id === selectedTruckId);
      if (truck) {
        if (truck.status === 'esperando_salida') {
          setSelectedDriverName(truck.activeDriver || '');
          setSelectedRouteId(truck.activeRoute || '');
          
          // Pre-populate Step 2 quantities from truck's inventory
          const initialLoads: { [productId: string]: number } = {};
          products.forEach(p => {
            initialLoads[p.id] = (truck.inventory || {})[p.id] || 0;
          });
          setLoadQuantities(initialLoads);
        } else if (truck.status === 'bodega') {
          setSelectedDriverName('');
          setSelectedRouteId('');
          setLoadQuantities({});
        }
      }
    }
  }, [selectedTruckId, trucks, products]);

  // Clean form when user switches active truck in Step 1
  const handleTruckSelectChange = (truckId: string) => {
    setSelectedTruckId(truckId);
    const truck = trucks.find(t => t.id === truckId);
    if (truck && truck.status === 'esperando_salida') {
      // If truck is already waiting for departure, jump directly to step 2 as draft
      setStep(2);
    } else {
      setStep(1);
    }
  };

  // Validations for Step 1
  // 1. Trucks: bodega or esperando_salida
  const availableTrucks = trucks.filter(t => t.status === 'bodega' || t.status === 'esperando_salida');

  // 2. Drivers: active and not assigned to ANOTHER truck in esperando_salida/transito
  const availableDrivers = users.filter(u => {
    if (u.role !== 'driver' || !u.isActive) return false;
    // Check if this driver is assigned to another truck
    const isAssignedToOther = trucks.some(t => 
      t.id !== selectedTruckId && 
      (t.status === 'esperando_salida' || t.status === 'transito') && 
      t.activeDriver === u.name
    );
    return !isAssignedToOther;
  });

  // 3. Routes: 1 to 10, not assigned to ANOTHER truck in esperando_salida/transito
  const availableRoutes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(r => {
    const isRouteOtherActive = trucks.some(t => 
      t.id !== selectedTruckId && 
      (t.status === 'esperando_salida' || t.status === 'transito') && 
      t.activeRoute === String(r)
    );
    return !isRouteOtherActive;
  });

  // Save Step 1: Assign truck, driver, and route, set state to esperando_salida
  const handleSaveStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTruckId || !selectedDriverName || !selectedRouteId) {
      alert("Por favor selecciona camioneta, chofer y ruta.");
      return;
    }

    const truck = trucks.find(t => t.id === selectedTruckId);
    if (!truck) return;

    try {
      const updatedTruck: Truck = {
        ...truck,
        status: 'esperando_salida',
        activeDriver: selectedDriverName,
        activeRoute: selectedRouteId,
        salesToday: truck.salesToday !== undefined ? truck.salesToday : 0
      };

      await syncService.updateTruck(updatedTruck);
      
      // Save details to LocalStorage in case we act as dispatch
      localStorage.setItem('active_route_id', selectedRouteId);
      localStorage.setItem('active_driver_name', selectedDriverName);
      localStorage.setItem('active_truck_plates', `${truck.name} (Eco: ${truck.ecoNumber})`);

      onTrucksUpdated();
      alert(`Paso 1 completado: Se asignó a ${selectedDriverName} en la Ruta ${selectedRouteId} para la unidad ${truck.name}.`);
      setStep(2);
    } catch (err) {
      console.error("Error saving Step 1:", err);
      alert("Error al guardar la asignación preliminar.");
    }
  };

  // Product Categorization helper
  const getProductCategory = (p: Product): string => {
    const name = p.name.toLowerCase();
    const brand = (p.brand || '').toLowerCase();
    if (name.includes('huevo') || brand.includes('calvario') || brand.includes('calderon') || brand.includes('calderón')) {
      return 'Huevo';
    }
    if (name.includes('aceite') || name.includes('manteca') || name.includes('grasa')) {
      return 'Aceite/Manteca';
    }
    if (name.includes('azucar') || name.includes('azúcar')) {
      return 'Azúcar';
    }
    if (name.includes('leche') || name.includes('lala') || name.includes('queso') || name.includes('lacteo') || name.includes('lácteo')) {
      return 'Lácteos';
    }
    return 'Otros';
  };

  const getCategoryEmoji = (category: string) => {
    switch (category) {
      case 'Huevo': return '🥚';
      case 'Aceite/Manteca': return '🛢️';
      case 'Azúcar': return '🍬';
      case 'Lácteos': return '🥛';
      default: return '📦';
    }
  };

  // Filtering products for Step 2
  const categoriesList = ['Todos', 'Huevo', 'Aceite/Manteca', 'Azúcar', 'Lácteos', 'Otros'];
  
  const filteredProducts = products.filter(p => {
    const category = getProductCategory(p);
    const matchesTab = selectedCategoryTab === 'Todos' || category === selectedCategoryTab;

    const term = productSearchText.toLowerCase();
    const matchesSearch = 
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.brand && p.brand.toLowerCase().includes(term));

    return matchesTab && matchesSearch;
  });

  // Adjust quantity loaders
  const handleAdjustLoadQty = (productId: string, amount: number) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    setLoadQuantities(prev => {
      const current = prev[productId] || 0;
      const next = Math.max(0, current + amount);
      if (next > prod.stock) {
        alert(`La cantidad ingresada (${next}) supera el stock disponible en bodega (${prod.stock} ${prod.unit}).`);
        return prev;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleDirectLoadQtyChange = (productId: string, val: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const qty = val === '' ? 0 : Math.max(0, parseInt(val, 10));
    if (isNaN(qty)) return;

    if (qty > prod.stock) {
      alert(`La cantidad ingresada (${qty}) supera el stock disponible en bodega (${prod.stock} ${prod.unit}).`);
      return;
    }

    setLoadQuantities(prev => ({
      ...prev,
      [productId]: qty
    }));
  };

  // Save Step 2: Update truck inventory fields and save local product stock references
  const handleSaveStep2 = async () => {
    const truck = trucks.find(t => t.id === selectedTruckId);
    if (!truck) return;

    // Check if at least one item is loaded
    const totalItems = Object.values(loadQuantities).reduce((sum, v) => sum + v, 0);
    if (totalItems === 0) {
      alert("Por favor carga al menos un producto con cantidad mayor a cero.");
      return;
    }

    try {
      const inventory: { [productId: string]: number } = {};
      
      // Update IndexedDB products references
      for (const prod of products) {
        const loadQty = loadQuantities[prod.id] || 0;
        
        // Save in truck inventory object
        if (loadQty > 0) {
          inventory[prod.id] = loadQty;
        }

        // Adjust master product entity fields
        const updatedProd: Product = {
          ...prod,
          truckStock: loadQty,
          truckStockLoaded: loadQty
        };
        await saveLocalProduct(updatedProd);
      }

      // Update truck inventory in firebase
      const updatedTruck: Truck = {
        ...truck,
        inventory: inventory,
        initialLoaded: inventory,
        recharges: {}
      };
      await syncService.updateTruck(updatedTruck);

      onProductsUpdated();
      onTrucksUpdated();

      alert(`Paso 2 completado: Inventario de ${totalItems} artículos guardado en la camioneta.`);
      setStep(3);
    } catch (err) {
      console.error("Error saving Step 2:", err);
      alert("Error al guardar el inventario de la camioneta.");
    }
  };

  // Save Step 3: dispatch truck (Banderazo)
  const handleBanderazoSalida = async () => {
    const truck = trucks.find(t => t.id === selectedTruckId);
    if (!truck) return;

    try {
      const updatedTruck: Truck = {
        ...truck,
        status: 'transito'
      };
      await syncService.updateTruck(updatedTruck);
      
      onTrucksUpdated();
      alert(`🚀 ¡Banderazo de salida exitoso! La unidad ${truck.name} está ahora EN TRÁNSITO con el chofer ${selectedDriverName} en la Ruta ${selectedRouteId}.`);
      
      // Reset wizard
      setSelectedTruckId('');
      setSelectedDriverName('');
      setSelectedRouteId('');
      setLoadQuantities({});
      setStep(1);
    } catch (err) {
      console.error("Error dispatching truck:", err);
      alert("Error al dar el banderazo de salida.");
    }
  };

  const selectedTruckObj = trucks.find(t => t.id === selectedTruckId);

  // Access check
  if (activeSessionUser !== 'admin') {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>⛔</span>
        <h3 style={{ fontWeight: 800, color: 'var(--danger-color)' }}>Acceso Denegado</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Solo los administradores o dueños del sistema pueden realizar la carga y salida de camionetas.
        </p>
      </div>
    );
  }

  return (
    <IonGrid style={{ padding: 0 }}>
      {/* Wizard Progress Bar */}
      <IonRow>
        <IonCol size="12">
          <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem', background: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                🚀 Proceso de Salida de Camioneta
              </h3>
              <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700 }}>
                <span style={{ 
                  color: step === 1 ? 'var(--primary-color)' : 'var(--text-secondary)', 
                  background: step === 1 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0,0,0,0.03)', 
                  padding: '0.25rem 0.5rem', 
                  borderRadius: '6px' 
                }}>
                  1️⃣ Asignación
                </span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ 
                  color: step === 2 ? 'var(--primary-color)' : 'var(--text-secondary)', 
                  background: step === 2 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0,0,0,0.03)', 
                  padding: '0.25rem 0.5rem', 
                  borderRadius: '6px' 
                }}>
                  2️⃣ Carga Inventario
                </span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ 
                  color: step === 3 ? 'var(--primary-color)' : 'var(--text-secondary)', 
                  background: step === 3 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0,0,0,0.03)', 
                  padding: '0.25rem 0.5rem', 
                  borderRadius: '6px' 
                }}>
                  3️⃣ Banderazo
                </span>
              </div>
            </div>
          </div>
        </IonCol>
      </IonRow>

      {/* Main Wizard Panels */}
      <IonRow>
        <IonCol size="12">
          {/* STEP 1: ROUTE AND VEHICLE CONFIGURATION */}
          {step === 1 && (
            <div className="glass-card" style={{ padding: '1.25rem', background: 'white' }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary-color)', margin: '0 0 1.25rem 0' }}>
                1️⃣ Asignación de Camioneta, Vendedor y Ruta
              </h4>

              <form onSubmit={handleSaveStep1}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '500px' }}>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                      🚚 Seleccionar Camioneta Disponible
                    </label>
                    <select
                      className="form-control"
                      value={selectedTruckId}
                      onChange={(e) => handleTruckSelectChange(e.target.value)}
                      style={{ padding: '0.55rem', fontSize: '0.85rem' }}
                      required
                    >
                      <option value="">Seleccionar Unidad</option>
                      {availableTrucks.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name} (Eco: {t.ecoNumber}) - {t.status === 'esperando_salida' ? '⏳ Draft/En Asignación' : '🏭 Disponible en Bodega'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                      👤 Seleccionar Chofer / Vendedor Libre
                    </label>
                    <select
                      className="form-control"
                      value={selectedDriverName}
                      onChange={(e) => setSelectedDriverName(e.target.value)}
                      style={{ padding: '0.55rem', fontSize: '0.85rem' }}
                      required
                      disabled={!selectedTruckId}
                    >
                      <option value="">Seleccionar Chofer</option>
                      {availableDrivers.map(u => (
                        <option key={u.id} value={u.name}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                      🛣️ Ruta Asignada Libre
                    </label>
                    <select
                      className="form-control"
                      value={selectedRouteId}
                      onChange={(e) => setSelectedRouteId(e.target.value)}
                      style={{ padding: '0.55rem', fontSize: '0.85rem' }}
                      required
                      disabled={!selectedTruckId}
                    >
                      <option value="">Seleccionar Ruta</option>
                      {availableRoutes.map(r => (
                        <option key={r} value={String(r)}>Ruta {r}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ marginTop: '0.5rem', padding: '0.65rem 1rem', fontSize: '0.85rem', fontWeight: 700 }}
                    disabled={!selectedTruckId || !selectedDriverName || !selectedRouteId}
                  >
                    💾 Guardar Paso 1 e Ir a Inventario →
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 2: LOAD INVENTORY (CARDS LAYOUT) */}
          {step === 2 && (
            <div className="glass-card" style={{ padding: '1.25rem', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary-color)', margin: 0 }}>
                    2️⃣ Cargar Inventario a la Camioneta
                  </h4>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                    Chofer: <strong>{selectedDriverName}</strong> | Camioneta: <strong>{selectedTruckObj?.name}</strong> | Ruta: <strong>Ruta {selectedRouteId}</strong>
                  </div>
                </div>
                
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(1)}
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                >
                  ← Modificar Asignación
                </button>
              </div>

              {/* Category Tab Filters & Search */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {/* Search */}
                <input
                  type="text"
                  placeholder="Buscar producto a cargar..."
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

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {categoriesList.map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSelectedCategoryTab(tab)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        border: '1px solid',
                        borderColor: selectedCategoryTab === tab ? 'var(--primary-color)' : 'var(--card-border)',
                        background: selectedCategoryTab === tab ? 'var(--primary-color)' : 'white',
                        color: selectedCategoryTab === tab ? 'white' : 'var(--text-main)',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      {getCategoryEmoji(tab)} {tab === 'Todos' ? 'Todos' : tab === 'Aceite/Manteca' ? 'Aceites' : tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', 
                gap: '1rem', 
                maxHeight: '480px', 
                overflowY: 'auto', 
                padding: '0.25rem',
                marginBottom: '1.5rem',
                border: '1px solid var(--card-border)',
                borderRadius: '8px',
                background: '#f9f9f9'
              }}>
                {filteredProducts.map(p => {
                  const qty = loadQuantities[p.id] || 0;
                  const category = getProductCategory(p);
                  const emoji = getCategoryEmoji(category);

                  return (
                    <div 
                      key={p.id}
                      style={{
                        background: 'white',
                        border: '1px solid var(--card-border)',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        boxShadow: qty > 0 ? '0 0 8px rgba(59, 130, 246, 0.1)' : 'none',
                        borderColor: qty > 0 ? 'var(--primary-color)' : 'var(--card-border)'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '1.25rem' }}>{emoji}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>#{p.sku}</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '0.35rem' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          Disponible: <strong>{p.stock} {p.unit}</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => handleAdjustLoadQty(p.id, -10)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', minWidth: '32px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Quitar 10"
                          >
                            -10
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdjustLoadQty(p.id, -1)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', minWidth: '24px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Quitar 1"
                          >
                            ➖
                          </button>

                          <input
                            type="number"
                            value={qty}
                            onChange={(e) => handleDirectLoadQtyChange(p.id, e.target.value)}
                            style={{
                              width: '52px',
                              padding: '0.25rem',
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
                            onClick={() => handleAdjustLoadQty(p.id, 1)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', minWidth: '24px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Añadir 1"
                          >
                            ➕
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAdjustLoadQty(p.id, 10)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', minWidth: '32px', borderRadius: '4px', cursor: 'pointer' }}
                            title="Añadir 10"
                          >
                            +10
                          </button>
                        </div>

                        {qty > 0 && (
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-color)', textAlign: 'center' }}>
                            ✓ Cargando: {qty} {p.unit}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    No se encontraron productos para esta categoría.
                  </div>
                )}
              </div>

              {/* Confirm Step 2 */}
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveStep2}
                style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem', fontWeight: 700 }}
              >
                💾 Guardar Paso 2 e Ir a Confirmación →
              </button>
            </div>
          )}

          {/* STEP 3: DISPATCH (SUMMARY AND BANDERAZO) */}
          {step === 3 && (
            <div className="glass-card" style={{ padding: '1.25rem', background: 'white' }}>
              <h4 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary-color)', margin: '0 0 1.25rem 0' }}>
                3️⃣ Resumen de Salida y Banderazo
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                
                {/* Details card */}
                <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', border: '1px solid var(--card-border)', fontSize: '0.85rem' }}>
                  <h5 style={{ fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.75rem 0' }}>
                    📋 Datos de la Ruta
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div>🚚 <strong>Camioneta:</strong> {selectedTruckObj?.name}</div>
                    <div>🏷️ <strong>Placas / Eco:</strong> {selectedTruckObj?.ecoNumber}</div>
                    <div>👤 <strong>Chofer / Vendedor:</strong> {selectedDriverName}</div>
                    <div>🛣️ <strong>Ruta:</strong> Ruta {selectedRouteId}</div>
                  </div>
                </div>

                {/* Loaded inventory summary */}
                <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', border: '1px solid var(--card-border)', fontSize: '0.85rem' }}>
                  <h5 style={{ fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.75rem 0' }}>
                    📦 Resumen de Mercancía Cargada
                  </h5>
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table className="client-table" style={{ fontSize: '0.75rem' }}>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th style={{ textAlign: 'right', width: '80px' }}>Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products
                          .filter(p => (loadQuantities[p.id] || 0) > 0)
                          .map(p => (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 600 }}>{p.name}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-color)' }}>
                                {loadQuantities[p.id]} {p.unit}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(2)}
                  style={{ flex: 1, padding: '0.65rem', fontSize: '0.85rem' }}
                >
                  ← Modificar Inventario
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBanderazoSalida}
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    padding: '0.65rem 1.25rem',
                    border: 'none',
                    borderRadius: '8px',
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
              </div>

            </div>
          )}
        </IonCol>
      </IonRow>
    </IonGrid>
  );
};

export default DispatchModule;
