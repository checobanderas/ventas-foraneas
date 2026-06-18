import React, { useState } from 'react';
import { IonGrid, IonRow, IonCol } from '@ionic/react';
import type { User } from '../db/indexedDB';

interface UserModuleProps {
  users: User[];
}

export const UserModule: React.FC<UserModuleProps> = ({ users }) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'driver'>('all');

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchText.toLowerCase()) ||
      user.username.toLowerCase().includes(searchText.toLowerCase()) ||
      user.phone.includes(searchText);

    const matchesRole = roleFilter === 'all' || user.role === 'driver';

    return matchesSearch && matchesRole;
  });

  return (
    <IonGrid style={{ padding: 0 }}>
      <IonRow>
        <IonCol size="12">
          <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>
                👤 Usuarios ({filteredUsers.length})
              </h3>
              
              {/* Toggle Table/Cards */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.04)', padding: '0.2rem', borderRadius: '8px' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  style={{
                    padding: '0.3rem 0.60rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: viewMode === 'table' ? '#fff' : 'transparent',
                    color: viewMode === 'table' ? 'var(--primary-color)' : 'var(--text-secondary)',
                    boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.1s ease'
                  }}
                >
                  📋 Tabla
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  style={{
                    padding: '0.3rem 0.60rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: viewMode === 'cards' ? '#fff' : 'transparent',
                    color: viewMode === 'cards' ? 'var(--primary-color)' : 'var(--text-secondary)',
                    boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.1s ease'
                  }}
                >
                  🗂️ Tarjetas
                </button>
              </div>
            </div>

            {/* Filters and Search Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="search-bar-wrapper">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar usuario por nombre, usuario o teléfono..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>

              {/* Role Filter Pills */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`category-pill ${roleFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('all')}
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.85rem' }}
                >
                  🌍 Todos los Usuarios
                </button>
                <button
                  type="button"
                  className={`category-pill ${roleFilter === 'driver' ? 'active' : ''}`}
                  onClick={() => setRoleFilter('driver')}
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.85rem' }}
                >
                  🚚 Choferes / Vendedores
                </button>
              </div>
            </div>
          </div>
        </IonCol>
      </IonRow>

      <IonRow>
        <IonCol size="12">
          {filteredUsers.length === 0 ? (
            <div className="glass-card" style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>👥</span>
              <strong>No se encontraron usuarios</strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>Intenta ajustando los criterios de búsqueda o filtros.</p>
            </div>
          ) : viewMode === 'table' ? (
            
            /* TABLE VIEW */
            <div className="table-responsive">
              <table className="client-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Nombre completo</th>
                    <th style={{ width: '30%' }}>Usuario / Login</th>
                    <th style={{ width: '15%' }}>Rol / Puesto</th>
                    <th style={{ width: '15%' }}>Contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                          {user.name}
                        </div>
                        {user.mysqlId && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ID Ref: #{user.mysqlId}
                          </div>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.03)', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>
                          {user.username}
                        </code>
                      </td>
                      <td>
                        {user.role === 'driver' ? (
                          <span className="sync-indicator-badge synced" style={{ background: 'var(--primary-color)', fontSize: '0.65rem' }}>Chofer</span>
                        ) : user.role === 'supervisor' ? (
                          <span className="sync-indicator-badge pending" style={{ background: 'var(--secondary-color)', fontSize: '0.65rem' }}>Supervisor</span>
                        ) : (
                          <span className="sync-indicator-badge pending" style={{ background: 'var(--accent-color)', fontSize: '0.65rem' }}>Admin</span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          {user.phone ? <span>📞 {user.phone}</span> : <span style={{ color: 'var(--text-muted)' }}>Sin teléfono</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            
            /* CARDS VIEW */
            <div className="cards-container">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="client-card-item"
                  style={{
                    borderColor: 'var(--card-border)',
                    background: 'hsla(224, 47%, 9%, 0.4)',
                    padding: '0.85rem'
                  }}
                >
                  <div className="client-card-info" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div className="client-card-name" style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                        {user.name}
                      </div>
                      <div>
                        {user.role === 'driver' ? (
                          <span className="sync-indicator-badge synced" style={{ background: 'var(--primary-color)', fontSize: '0.6rem' }}>Chofer</span>
                        ) : user.role === 'supervisor' ? (
                          <span className="sync-indicator-badge pending" style={{ background: 'var(--secondary-color)', fontSize: '0.6rem' }}>Supervisor</span>
                        ) : (
                          <span className="sync-indicator-badge pending" style={{ background: 'var(--accent-color)', fontSize: '0.6rem' }}>Admin</span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <div>👤 <strong>Usuario:</strong> {user.username}</div>
                      {user.phone && <div>📞 <strong>Teléfono:</strong> {user.phone}</div>}
                      {user.mysqlId && <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>ID Ref: #{user.mysqlId}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </IonCol>
      </IonRow>
    </IonGrid>
  );
};
