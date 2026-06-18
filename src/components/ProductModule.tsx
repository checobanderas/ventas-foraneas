import React, { useState } from 'react';
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
import type { Product } from '../db/indexedDB';
import { syncService } from '../db/syncService';

interface ProductModuleProps {
  onProductsUpdated: () => void;
  products: Product[];
}

export const ProductModule: React.FC<ProductModuleProps> = ({
  onProductsUpdated,
  products
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
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

  // Form States
  const [isEditing, setIsEditing] = useState(false);
  const [id, setId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('PZA');
  const [price, setPrice] = useState<number>(0);
  const [cost, setCost] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);

  const openAddModal = () => {
    setIsEditing(false);
    clearForm();
    setIsModalOpen(true);
  };

  const openEditModal = (prod: Product) => {
    setIsEditing(true);
    setId(prod.id);
    setSku(prod.sku);
    setName(prod.name);
    setBrand(prod.brand || '');
    setUnit(prod.unit || 'PZA');
    setPrice(prod.price);
    setCost(prod.cost || 0);
    setStock(prod.stock || 0);
    setIsModalOpen(true);
  };

  const clearForm = () => {
    setId('');
    setSku('');
    setName('');
    setBrand('');
    setUnit('PZA');
    setPrice(0);
    setCost(0);
    setStock(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !sku.trim()) {
      alert("Por favor llena los campos requeridos (Nombre y SKU).");
      return;
    }

    try {
      if (isEditing && id) {
        // Edit existing product
        const existing = products.find(p => p.id === id);
        if (!existing) return;
        
        await syncService.updateProduct({
          ...existing,
          sku,
          name,
          brand,
          unit,
          price: Number(price),
          cost: Number(cost),
          stock: Number(stock)
        });
      } else {
        // Create new product
        const newId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await syncService.addProduct({
          id: newId,
          sku,
          name,
          brand,
          unit,
          price: Number(price),
          cost: Number(cost),
          stock: Number(stock)
        });
      }
      setIsModalOpen(false);
      clearForm();
      onProductsUpdated();
    } catch (err) {
      console.error("Error saving product:", err);
      alert("Error al guardar el producto.");
    }
  };

  const handleDeleteClick = async (productId: string) => {
    if (confirm('¿Estás seguro de eliminar este producto del catálogo?')) {
      try {
        await syncService.deleteProduct(productId);
        onProductsUpdated();
      } catch (err) {
        console.error("Error deleting product:", err);
        alert("Error al eliminar el producto.");
      }
    }
  };

  return (
    <IonGrid style={{ padding: 0 }}>
      <IonRow>
        <IonCol size="12">
          <div className="glass-card" style={{ padding: '1rem' }}>
            
            {/* Header controls with Search & Brand Filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {/* Row 1: Title & Mode Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                  📦 Productos ({filteredProducts.length})
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

              {/* Row 2: Compact Search & Brand dropdown */}
              <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
                
                {/* Compact Search Input */}
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', pointerEvents: 'none' }}>
                    🔍
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar SKU o nombre..."
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

                {/* Compact Brand Filter */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
                      WebkitAppearance: 'none',
                      minWidth: '95px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Marcas</option>
                    {uniqueBrands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

              </div>
            </div>

            {products.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>📦</div>
                <p>No hay productos en el catálogo.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Presiona el botón (+) abajo a la derecha para agregar un producto.</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>🔍</div>
                <p>No se encontraron productos.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Prueba con otros términos o filtros.</p>
              </div>
            ) : viewMode === 'table' ? (
              
              /* TABLE VIEW */
              <div className="table-responsive">
                <table className="client-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>SKU / Marca</th>
                      <th style={{ width: '35%' }}>Nombre / Unidad</th>
                      <th style={{ width: '25%', textAlign: 'right' }}>Precios / Stock</th>
                      <th style={{ textAlign: 'center', width: '15%' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((prod) => {
                      return (
                        <tr key={prod.id}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                              #{prod.sku}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--secondary-color)', fontWeight: 600 }}>
                              {prod.brand || 'Genérico'}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                              {prod.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Unidad: {prod.unit}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                              Precio: ${prod.price.toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Costo: ${prod.cost ? prod.cost.toFixed(2) : '0.00'}
                            </div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: prod.stock > 0 ? 'var(--text-muted)' : 'var(--danger-color)' }}>
                              Stock: {prod.stock}
                            </div>
                            {prod.syncStatus && prod.syncStatus !== 'synced' && (
                              <span className="sync-indicator-badge pending" style={{ fontSize: '0.55rem', padding: '0.05rem 0.2rem', marginTop: '0.1rem', display: 'inline-block' }}>Local</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="emoji-action-btn"
                                onClick={() => openEditModal(prod)}
                                title="Editar"
                                style={{ padding: '0.2rem' }}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                className="emoji-action-btn"
                                onClick={() => handleDeleteClick(prod.id)}
                                title="Eliminar"
                                style={{ padding: '0.2rem' }}
                              >
                                🗑️
                              </button>
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
                {filteredProducts.map((prod) => {
                  return (
                    <div
                      key={prod.id}
                      className="client-card-item"
                      style={{
                        borderColor: 'var(--card-border)',
                        background: 'rgba(255, 255, 255, 0.4)',
                        padding: '0.75rem'
                      }}
                    >
                      <div className="client-card-info">
                        <div className="client-card-name" style={{ fontSize: '0.95rem' }}>
                          {prod.name}
                          {prod.syncStatus && prod.syncStatus !== 'synced' && (
                            <span className="sync-indicator-badge pending" style={{ fontSize: '0.55rem' }}>Local</span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.75rem', color: 'var(--secondary-color)', fontWeight: 600 }}>
                          SKU: #{prod.sku} {prod.brand ? `• Marca: ${prod.brand}` : ''}
                        </div>

                        <div style={{ marginTop: '0.3rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', fontSize: '0.8rem' }}>
                          <span>🏷️ Unidad: <strong>{prod.unit}</strong></span>
                          <span>💰 Precio: <strong style={{ color: 'var(--primary-color)' }}>${prod.price.toFixed(2)}</strong></span>
                          <span>📉 Costo: <strong>${prod.cost ? prod.cost.toFixed(2) : '0.00'}</strong></span>
                          <span>📦 Stock: <strong style={{ color: prod.stock > 0 ? 'inherit' : 'var(--danger-color)' }}>{prod.stock}</strong></span>
                        </div>
                      </div>

                      <div className="client-card-actions">
                        <button
                          type="button"
                          className="emoji-action-btn"
                          onClick={() => openEditModal(prod)}
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="emoji-action-btn"
                          onClick={() => handleDeleteClick(prod.id)}
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

      {/* FAB to Add New Product */}
      <IonFab vertical="bottom" horizontal="end" slot="fixed" style={{ margin: '1rem', zIndex: 100 }}>
        <IonFabButton onClick={openAddModal} color="primary" style={{ fontSize: '1.5rem', '--box-shadow': 'var(--shadow-lg)' }}>
          ➕
        </IonFabButton>
      </IonFab>

      {/* Modal containing the product form */}
      <IonModal isOpen={isModalOpen} onDidDismiss={() => setIsModalOpen(false)}>
        <IonHeader>
          <IonToolbar style={{ '--background': 'hsla(224, 71%, 6%, 0.9)', '--border-color': 'var(--card-border)' }}>
            <IonTitle style={{ fontSize: '1rem', fontWeight: 700 }}>
              {isEditing ? '✏️ Editar Producto' : '➕ Registrar Producto'}
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
                <label className="form-label">Nombre del Producto *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej. Huevo San Juan Rojo Blanco"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Código / SKU *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej. HUE001"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Marca / Departamento</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ej. San Juan"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Unidad de Medida</label>
                <select
                  className="form-control"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="PZA">Pieza (PZA)</option>
                  <option value="KG">Kilogramo (KG)</option>
                  <option value="CJA">Caja (CJA)</option>
                  <option value="PAQ">Paquete (PAQ)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Precio de Venta ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="Ej. 45.50"
                  value={price || ''}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Costo de Compra ($)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="Ej. 32.00"
                  value={cost || ''}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stock Inicial (Existencia)</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="Ej. 100"
                  value={stock || ''}
                  onChange={(e) => setStock(Number(e.target.value))}
                />
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

export default ProductModule;
