import React, { useState, useEffect } from 'react';
import { 
  IonApp, 
  IonHeader, 
  IonContent,
  IonSplitPane,
  IonMenu,
  IonMenuToggle,
  IonList,
  IonItem,
  IonLabel,
  IonMenuButton,
  IonToolbar,
  IonButtons
} from '@ionic/react';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getLocalClients, getLocalProducts } from './db/indexedDB';
import type { Client, Product } from './db/indexedDB';
import { syncService } from './db/syncService';
import ClientModule from './components/ClientModule';
import ProductModule from './components/ProductModule';
import TruckModule from './components/TruckModule';

export const App: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [currentView, setCurrentView] = useState<'clients' | 'products' | 'truck'>('clients');
  
  // Connection and Sync states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    lastSyncedAt: Date | null;
    error: string | null;
  }>({
    isSyncing: false,
    lastSyncedAt: null,
    error: null
  });

  const [syncLogs, setSyncLogs] = useState<Array<{ time: string; msg: string; type: 'info' | 'success' | 'error' }>>([]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setSyncLogs(prev => [{ time, msg, type }, ...prev].slice(0, 30));
  };

  const loadLocalData = async () => {
    try {
      const localClients = await getLocalClients();
      setClients(localClients);
      const localProducts = await getLocalProducts();
      setProducts(localProducts);
    } catch (err) {
      console.error("Error loading local data:", err);
      addLog("Error cargando base de datos local", "error");
    }
  };

  useEffect(() => {
    loadLocalData();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addLog("Conexión de red restablecida. Modo En Línea.", "success");
    };
    const handleOffline = () => {
      setIsOnline(false);
      addLog("Conexión de red perdida. Modo Fuera de Línea.", "info");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = syncService.addListener((status) => {
      setSyncStatus(status);
      if (!status.isSyncing) {
        loadLocalData();
        if (status.error) {
          addLog(`Sincronización fallida: ${status.error}`, "error");
        } else if (status.lastSyncedAt) {
          addLog("Sincronización exitosa con Firebase.", "success");
        }
      } else {
        addLog("Sincronizando datos con Firebase...", "info");
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      syncService.sync().catch(err => {
        console.error("Initial load sync failed:", err);
      });
    }
  }, []);

  const handleSyncClick = async () => {
    addLog("Iniciando sincronización manual...", "info");
    await syncService.sync();
  };

  return (
    <IonApp>
      <IonSplitPane contentId="main-content">
        {/* Navigation Left Sidebar Menu */}
        <IonMenu contentId="main-content" type="overlay">
          <IonHeader style={{ boxShadow: 'none' }}>
            <IonToolbar style={{ '--background': 'hsla(210, 40%, 96%, 1)', '--border-color': 'var(--card-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem' }}>
                <div className="brand-logo" style={{ width: '28px', height: '28px', fontSize: '0.85rem' }}>VF</div>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>Ventas Foráneas</span>
              </div>
            </IonToolbar>
          </IonHeader>

          <IonContent style={{ '--background': 'var(--bg-color)' }}>
            <IonList style={{ background: 'transparent', padding: '1rem 0.5rem' }}>
              <IonMenuToggle autoHide={false}>
                <IonItem 
                  button 
                  onClick={() => setCurrentView('clients')} 
                  style={{
                    '--background': currentView === 'clients' ? 'hsla(224, 76%, 54%, 0.12)' : 'transparent',
                    '--color': currentView === 'clients' ? 'var(--primary-color)' : 'var(--text-main)',
                    '--border-radius': '8px',
                    '--margin-bottom': '0.5rem',
                    'fontWeight': 700,
                    'fontSize': '0.9rem',
                    'cursor': 'pointer'
                  }}
                  lines="none"
                >
                  <span style={{ fontSize: '1.25rem', marginRight: '0.75rem' }}>👥</span>
                  <IonLabel>Catálogo de Clientes</IonLabel>
                </IonItem>

                <IonItem 
                  button 
                  onClick={() => setCurrentView('products')} 
                  style={{
                    '--background': currentView === 'products' ? 'hsla(224, 76%, 54%, 0.12)' : 'transparent',
                    '--color': currentView === 'products' ? 'var(--primary-color)' : 'var(--text-main)',
                    '--border-radius': '8px',
                    '--margin-bottom': '0.5rem',
                    'fontWeight': 700,
                    'fontSize': '0.9rem',
                    'cursor': 'pointer'
                  }}
                  lines="none"
                >
                  <span style={{ fontSize: '1.25rem', marginRight: '0.75rem' }}>📦</span>
                  <IonLabel>Catálogo de Productos</IonLabel>
                </IonItem>

                <IonItem 
                  button 
                  onClick={() => setCurrentView('truck')} 
                  style={{
                    '--background': currentView === 'truck' ? 'hsla(224, 76%, 54%, 0.12)' : 'transparent',
                    '--color': currentView === 'truck' ? 'var(--primary-color)' : 'var(--text-main)',
                    '--border-radius': '8px',
                    '--margin-bottom': '0.5rem',
                    'fontWeight': 700,
                    'fontSize': '0.9rem',
                    'cursor': 'pointer'
                  }}
                  lines="none"
                >
                  <span style={{ fontSize: '1.25rem', marginRight: '0.75rem' }}>🚚</span>
                  <IonLabel>Mi Camioneta</IonLabel>
                </IonItem>
              </IonMenuToggle>
            </IonList>
          </IonContent>
        </IonMenu>

        {/* Main Content Area */}
        <div id="main-content" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
          <IonHeader>
            <header className="app-header" style={{ padding: '0.5rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Menu Button to trigger sidebar menu on mobile */}
                <IonButtons slot="start" style={{ display: 'flex', alignItems: 'center' }}>
                  <IonMenuButton style={{ color: 'var(--text-main)', fontSize: '1.3rem' }} />
                </IonButtons>

                <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="brand-name" style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                    {currentView === 'clients' ? '👥 Clientes' : currentView === 'products' ? '📦 Productos' : '🚚 Mi Camioneta'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className={`status-badge ${isOnline ? 'online' : 'offline'}`} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                  <div className="status-dot"></div>
                  <span>{isOnline ? 'En Línea' : 'Fuera'}</span>
                </div>

                <button 
                  className="btn btn-secondary"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  onClick={handleSyncClick}
                  disabled={syncStatus.isSyncing || !isOnline}
                >
                  <RefreshCw size={12} className={syncStatus.isSyncing ? 'animate-spin' : ''} />
                  <span>Sincronizar</span>
                </button>
              </div>
            </header>
          </IonHeader>

          <IonContent style={{ '--background': 'var(--bg-color)' }}>
            <main className="main-container" style={{ padding: '1rem', minHeight: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {currentView === 'clients' ? (
                <ClientModule 
                  onClientsUpdated={loadLocalData}
                  clients={clients}
                  selectedClient={selectedClient}
                  onSelectClient={setSelectedClient}
                />
              ) : currentView === 'products' ? (
                <ProductModule 
                  onProductsUpdated={loadLocalData}
                  products={products}
                />
              ) : (
                <TruckModule 
                  onInventoryUpdated={loadLocalData}
                  products={products}
                />
              )}

              {/* Sync Panel & Logs */}
              <footer className="glass-card" style={{ marginTop: 'auto', padding: '0.85rem' }}>
                <div className="sync-panel" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {syncStatus.error ? (
                      <AlertTriangle size={14} style={{ color: 'var(--danger-color)' }} />
                    ) : (
                      <CheckCircle2 size={14} style={{ color: 'var(--accent-color)' }} />
                    )}
                    <span>
                      {syncStatus.error 
                        ? `Error: ${syncStatus.error}` 
                        : syncStatus.isSyncing 
                          ? 'Sincronizando...' 
                          : 'Base de datos sincronizada.'
                      }
                    </span>
                  </div>
                  <span>
                    Sinc: {syncStatus.lastSyncedAt 
                      ? syncStatus.lastSyncedAt.toLocaleTimeString() 
                      : 'Sin sincronizar'}
                  </span>
                </div>

                {syncLogs.length > 0 && (
                  <div className="sync-logs" style={{ maxHeight: '80px', fontSize: '0.7rem', marginTop: '0.5rem' }}>
                    {syncLogs.slice(0, 5).map((log, index) => {
                      let color = 'var(--text-secondary)';
                      if (log.type === 'success') color = 'var(--accent-color)';
                      if (log.type === 'error') color = 'var(--danger-color)';
                      
                      return (
                        <div key={index} className="sync-log-entry" style={{ color }}>
                          <span className="sync-log-time">[{log.time}]</span>
                          <span>{log.msg}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </footer>
            </main>
          </IonContent>
        </div>
      </IonSplitPane>
    </IonApp>
  );
};

export default App;
