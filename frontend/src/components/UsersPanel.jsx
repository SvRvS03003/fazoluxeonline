import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X, Edit2, Sun, Moon } from 'lucide-react';
import API from '../config';

const UsersPanel = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' });
  const [userError, setUserError] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const token = localStorage.getItem('sr_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const canEdit = user.role === 'ADMIN' || user.role === 'NAZORATCHI';

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/users`, { headers });
      if (res.ok) {
        const allUsers = await res.json();
        if (user.role === 'ADMIN') {
          setUsers(allUsers.filter(u => u.id !== user.id));
        } else {
          setUsers(allUsers.filter(u => u.role !== 'ADMIN' && u.id !== user.id));
        }
      } else if (res.status === 401) {
        setUserError('Sessiya tugagan. Qayta kiring.');
      }
    } catch (e) {}
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreateUser = async () => {
    if (!userForm.username || !userForm.password || !userForm.full_name) {
      setUserError('Barcha maydonlarni toldiring');
      return;
    }
    try {
      const res = await fetch(`${API}/users`, { method: 'POST', headers, body: JSON.stringify(userForm) });
      if (res.ok) {
        setUserForm({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' });
        setShowUserForm(false);
        setUserError('');
        fetchUsers();
      } else {
        const data = await res.json();
        setUserError(res.status === 401 ? 'Sessiya tugagan. Qayta kiring.' : (data.detail || 'Xatolik'));
      }
    } catch (e) { setUserError('Server xatoligi'); }
  };

  const handleUpdateUser = async () => {
    if (!userForm.full_name) {
      setUserError('Ism maydoni majburiy');
      return;
    }
    try {
      const updateData = { 
        full_name: userForm.full_name, 
        shift_type: userForm.shift_type,
        role: userForm.role 
      };
      if (userForm.password) updateData.password = userForm.password;
      
      const res = await fetch(`${API}/users/${editingUser.id}`, {
        method: 'PUT', headers, body: JSON.stringify(updateData)
      });
      if (res.ok) {
        setEditingUser(null);
        setUserForm({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' });
        setUserError('');
        fetchUsers();
      } else {
        const data = await res.json();
        setUserError(res.status === 401 ? 'Sessiya tugagan. Qayta kiring.' : (data.detail || 'Xatolik'));
      }
    } catch (e) { setUserError('Server xatoligi'); }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Rostdan ham ochirmoqchimisiz?')) return;
    try {
      await fetch(`${API}/users/${id}`, { method: 'DELETE', headers });
      fetchUsers();
    } catch (e) {}
  };

  const startEdit = (u) => {
    setEditingUser(u);
    setUserForm({ username: u.username, password: '', full_name: u.full_name, role: u.role, shift_type: u.shift_type || 'KUNDUZ' });
    setShowUserForm(false);
  };

  const roleColors = { MASTER: '#3b82f6', NAZORATCHI: '#22c55e', MECHANIC: '#f59e0b', ELECTRIC: '#06b6d4', UZLAVYAZ: '#a855f7', ADMIN: '#ef4444' };

  return (
    <div className="panel-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Foydalanuvchilar</h2>
        {user.role === 'ADMIN' && (
          <button onClick={() => { setShowUserForm(!showUserForm); setUserError(''); setEditingUser(null); setUserForm({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' }); }} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
            background: 'var(--primary)', color: '#0f172a', border: 'none', borderRadius: '10px',
            cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem'
          }}>
            <Plus size={16} /> Yangi Foydalanuvchi
          </button>
        )}
      </div>

      {(showUserForm || editingUser) && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700 }}>
            {editingUser ? 'Foydalanuvchini Tahrirlash' : 'Yangi Foydalanuvchi'}
          </h3>
          {userError && <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>{userError}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Username</label>
              <input className="input-field" style={{ marginTop: '4px', marginBottom: '0' }} 
                value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} 
                placeholder="username" disabled={!!editingUser} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Parol {editingUser && '(yangilash uchun)'}</label>
              <input className="input-field" type="password" style={{ marginTop: '4px', marginBottom: '0' }} 
                value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} 
                placeholder={editingUser ? "Yangi parol..." : "password"} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>To'liq Ism</label>
              <input className="input-field" style={{ marginTop: '4px', marginBottom: '0' }} 
                value={userForm.full_name} onChange={e => setUserForm({...userForm, full_name: e.target.value})} 
                placeholder="Ism Familiya" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Smena</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button type="button" onClick={() => setUserForm({...userForm, shift_type: 'KUNDUZ'})} style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid',
                  borderColor: userForm.shift_type === 'KUNDUZ' ? '#f59e0b' : 'var(--border)',
                  background: userForm.shift_type === 'KUNDUZ' ? 'rgba(245,158,11,0.15)' : 'transparent',
                  color: userForm.shift_type === 'KUNDUZ' ? '#f59e0b' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}><Sun size={16} /> Kunduz</button>
                <button type="button" onClick={() => setUserForm({...userForm, shift_type: 'TUNGI'})} style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: '2px solid',
                  borderColor: userForm.shift_type === 'TUNGI' ? '#6366f1' : 'var(--border)',
                  background: userForm.shift_type === 'TUNGI' ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color: userForm.shift_type === 'TUNGI' ? '#6366f1' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}><Moon size={16} /> Tungi</button>
              </div>
            </div>
            {user.role === 'ADMIN' && (
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Rol</label>
                <select className="input-field" style={{ marginTop: '4px', marginBottom: '0' }} 
                  value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                  <option value="MASTER">MASTER</option>
                  <option value="NAZORATCHI">NAZORATCHI</option>
                  <option value="MECHANIC">MECHANIC</option>
                  <option value="ELECTRIC">ELECTRIC</option>
                  <option value="UZLAVYAZ">UZLAVYAZ</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button onClick={editingUser ? handleUpdateUser : handleCreateUser} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: 'var(--primary)', color: '#0f172a', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
              <Save size={14} /> {editingUser ? 'Saqlash' : 'Yaratish'}
            </button>
            <button onClick={() => { setShowUserForm(false); setEditingUser(null); setUserError(''); setUserForm({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' }); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>
              <X size={14} /> Bekor Qilish
            </button>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>Ism</th>
              <th style={thStyle}>Rol</th>
              <th style={thStyle}>Holat</th>
              <th style={thStyle}>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={tdStyle}>{u.username}</td>
                <td style={tdStyle}>{u.full_name}</td>
                <td style={tdStyle}>
                  <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: `${roleColors[u.role] || '#64748b'}22`, color: roleColors[u.role] || '#64748b' }}>{u.role}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: u.is_active ? '#22c55e' : '#ef4444', fontSize: '0.8rem' }}>{u.is_active ? 'Faol' : 'Nofaol'}</span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {canEdit && (
                      <button onClick={() => startEdit(u)} style={{ padding: '6px', background: '#3b82f622', color: '#3b82f6', border: '1px solid #3b82f644', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Edit2 size={14} />
                      </button>
                    )}
                    {user.role === 'ADMIN' && (
                      <button onClick={() => handleDeleteUser(u.id)} style={{ padding: '6px', background: '#ef444422', color: '#ef4444', border: '1px solid #ef444444', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' };
const tdStyle = { padding: '12px 16px', fontSize: '0.85rem', fontWeight: 500 };

export default UsersPanel;
