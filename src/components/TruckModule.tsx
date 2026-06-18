import React, { useState } from 'react';
import { 
  IonGrid, 
  IonRow, 
  IonCol
} from '@ionic/react';
import type { Product } from '../db/indexedDB';
import { saveLocalProduct } from '../db/indexedDB';

interface TruckModuleProps {
  onInventoryUpdated: () => void;
  products: Product[];
}

export const TruckModule: React.FC<TruckModuleProps> = ({
  onInventoryUpdated,
  products
}) => {
  // Configuration States (saved in LocalStorage)
  const [routeId, setRouteId] = useState<string>(localStorage.getItem('active_route_id') || '');
  const [truckPlates, setTruckPlates] = useState<string>(localStorage.getItem('active_truck_plates') || '');
  const [driverName, setDriverName] = useState<string>(localStorage.getItem('active_driver_name') || '');

  // Search & Brand Filter
  const [searchText, setSearchText] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');

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

  // Save config changes to localStorage
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('active_route_id', routeId);
    localStorage.setItem('active_truck_plates', truckPlates);
    localStorage.setItem('active_driver_name', driverName);
    alert('Configuración de la camioneta guardada con éxito.');
  };

  // Adjust Truck Stock
  const handleAdjustStock = async (prod: Product, quantity: number) => {
    const currentStock = prod.truckStock || 0;
    const nextStock = Math.max(0, currentStock + quantity);
    
    const updated = {
      ...prod,
      truckStock: nextStock
    };
    
    await saveLocalProduct(updated);
    onInventoryUpdated();
  };

  const handleDirectStockChange = async (prod: Product, val: string) => {
    const nextStock = val === '' ? 0 : Math.max(0, parseInt(val, 10));
    if (isNaN(nextStock)) return;

    const updated = {
      ...prod,
      truckStock: nextStock
    };
    
    await saveLocalProduct(updated);
    onInventoryUpdated();
  };

  // Quick reset all truck stock to 0
  const handleClearTruckStock = async () => {
    if (confirm('¿Estás seguro de vaciar todo el inventario de la camioneta?')) {
      for (const prod of products) {
        if (prod.truckStock && prod.truckStock > 0) {
          await saveLocalProduct({
            ...prod,
            truckStock: 0
          });
        }
      }
      onInventoryUpdated();
      alert('Inventario de la camioneta vaciado.');
    }
  };

  return (
    <IonGrid style={{ padding: 0 }}>
      {/* Section 1: Route & Truck Configuration Form */}
      <IonRow>
        <IonCol size="12">
          <div className="glass-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🚚 Configuración de Camioneta
            </h3>

            <form onSubmit={handleSaveConfig}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                
                <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Chofer / Vendedor</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. Carlos Ortiz"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                  />
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

                <div className="form-group" style={{ flex: '0 0 130px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Placas de Unidad</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej. RX-892-A"
                    value={truckPlates}
                    onChange={(e) => setTruckPlates(e.target.value)}
                    style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                  />
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
    </IonGrid>
  );
};

export default TruckModule;
