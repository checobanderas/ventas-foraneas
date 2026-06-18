import React, { useState } from 'react';
import { IonGrid, IonRow, IonCol } from '@ionic/react';
import type { Truck, Product } from '../db/indexedDB';
import { syncService } from '../db/syncService';

interface LogisticsModuleProps {
  trucks: Truck[];
  products: Product[];
  onTrucksUpdated: () => void;
}

export const LogisticsModule: React.FC<LogisticsModuleProps> = ({
  trucks,
  products,
  onTrucksUpdated
}) => {
  const [selectedTruck, setSelectedTruck] = useState<Truck | null>(null);

  // Status handler
  const handleUpdateStatus = async (truck: Truck, nextStatus: 'bodega' | 'taller') => {
    try {
      const updated: Truck = {
        ...truck,
        status: nextStatus,
        activeDriver: nextStatus === 'taller' ? null : truck.activeDriver,
        activeRoute: nextStatus === 'taller' ? null : truck.activeRoute
      };
      await syncService.updateTruck(updated);
      onTrucksUpdated();
      if (selectedTruck && selectedTruck.id === truck.id) {
        setSelectedTruck(updated);
      }
      alert(`Estado de la unidad ${truck.name} actualizado a ${nextStatus === 'bodega' ? 'Bodega' : 'Taller'}.`);
    } catch (err) {
      console.error("Error updating truck status:", err);
      alert("Error al actualizar el estado de la unidad.");
    }
  };

  return (
    <IonGrid style={{ padding: 0 }}>
      <IonRow>
        <IonCol size="12" sizeMd={selectedTruck ? "7" : "12"}>
          <div className="glass-card" style={{ padding: '1.25rem', height: '100%' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1.10rem', color: 'var(--text-main)', margin: '0 0 1.25rem 0' }}>
              🚚 Monitoreo de Logística de Flota
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              {trucks.map(truck => {
                const status = truck.status || 'bodega';
                const isSelected = selectedTruck?.id === truck.id;

                let statusBadgeColor = 'var(--text-secondary)';
                let statusBadgeText = '🏭 Bodega';
                let statusBg = 'rgba(0,0,0,0.04)';
                if (status === 'transito') {
                  statusBadgeColor = 'var(--accent-color)';
                  statusBadgeText = '🛣️ En Tránsito';
                  statusBg = 'rgba(16, 185, 129, 0.1)';
                } else if (status === 'taller') {
                  statusBadgeColor = 'var(--danger-color)';
                  statusBadgeText = '🔧 En Taller';
                  statusBg = 'rgba(239, 68, 68, 0.1)';
                }

                return (
                  <div
                    key={truck.id}
                    className="client-card-item"
                    onClick={() => setSelectedTruck(truck)}
                    style={{
                      cursor: 'pointer',
                      padding: '1rem',
                      borderColor: isSelected ? 'var(--primary-color)' : 'var(--card-border)',
                      background: isSelected ? 'hsla(224, 76%, 54%, 0.05)' : 'rgba(255, 255, 255, 0.45)',
                      boxShadow: isSelected ? '0 0 10px rgba(59, 130, 246, 0.15)' : 'none',
                      transition: 'all 0.2s ease-in-out'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      {truck.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      Placas/Eco: <code style={{ fontSize: '0.75rem' }}>{truck.ecoNumber}</code>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 700, 
                        color: statusBadgeColor,
                        background: statusBg,
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px'
                      }}>
                        {statusBadgeText}
                      </span>
                      
                      {status === 'transito' && truck.salesToday !== undefined && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-color)' }}>
                          ${(truck.salesToday || 0).toFixed(2)}
                        </span>
                      )}
                    </div>

                    {status === 'transito' && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', borderTop: '1px dashed var(--card-border)', paddingTop: '0.4rem' }}>
                        👤 {truck.activeDriver} {truck.activeRoute ? `• Ruta ${truck.activeRoute}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </IonCol>

        {/* Selected Truck Detail Panel */}
        {selectedTruck && (
          <IonCol size="12" sizeMd="5">
            <div className="glass-card" style={{ padding: '1.25rem', height: '100%', position: 'relative' }}>
              
              {/* Close Button */}
              <button 
                type="button" 
                onClick={() => setSelectedTruck(null)} 
                style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '1rem',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                ✕
              </button>

              <h3 style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>
                🔍 Monitoreo: {selectedTruck.name}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
                Placas/Eco: {selectedTruck.ecoNumber}
              </p>

              {/* Status change actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--card-border)' }}>
                {selectedTruck.status !== 'transito' ? (
                  <>
                    <button
                      type="button"
                      className={`btn ${selectedTruck.status === 'bodega' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleUpdateStatus(selectedTruck, 'bodega')}
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                    >
                      🏭 En Bodega
                    </button>
                    <button
                      type="button"
                      className={`btn ${selectedTruck.status === 'taller' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleUpdateStatus(selectedTruck, 'taller')}
                      style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                    >
                      🔧 En Taller
                    </button>
                  </>
                ) : (
                  <div className="alert info" style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem', width: '100%', margin: 0 }}>
                    🛣️ La unidad está activa en ruta y no se puede desactivar hasta que cierre su corte diario.
                  </div>
                )}
              </div>

              {/* Route & Driver details */}
              {selectedTruck.status === 'transito' ? (
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>
                    🛣️ Detalles de Operación
                  </h4>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.25rem' }}>
                    <div>👤 <strong>Chofer:</strong> {selectedTruck.activeDriver}</div>
                    <div>🛣️ <strong>Ruta Asignada:</strong> Ruta {selectedTruck.activeRoute}</div>
                    <div>💰 <strong>Venta de Hoy:</strong> <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>${(selectedTruck.salesToday || 0).toFixed(2)}</span></div>
                  </div>

                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>
                    📦 Inventario a Bordo
                  </h4>
                  <div style={{ maxHeight: 'calc(100vh - 460px)', overflowY: 'auto' }}>
                    <table className="client-table" style={{ fontSize: '0.75rem' }}>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th style={{ textAlign: 'right', width: '80px' }}>Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products
                          .filter(prod => selectedTruck.inventory && selectedTruck.inventory[prod.id] > 0)
                          .map(prod => {
                            const qty = selectedTruck.inventory ? selectedTruck.inventory[prod.id] : 0;
                            return (
                              <tr key={prod.id}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{prod.name}</div>
                                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>SKU: #{prod.sku}</div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                  {qty} {prod.unit}
                                </td>
                              </tr>
                            );
                          })}
                        {(!selectedTruck.inventory || Object.values(selectedTruck.inventory).every(v => v === 0)) && (
                          <tr>
                            <td colSpan={2} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                              La camioneta no lleva mercancía cargada.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '1.75rem', display: 'block', marginBottom: '0.5rem' }}>💤</span>
                  <strong>Unidad Inactiva</strong>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem' }}>
                    {selectedTruck.status === 'taller' ? 'La unidad está en el taller por mantenimiento.' : 'La unidad está estacionada en la bodega esperando asignación.'}
                  </p>
                </div>
              )}

            </div>
          </IonCol>
        )}
      </IonRow>
    </IonGrid>
  );
};
