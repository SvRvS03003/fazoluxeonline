import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Save, X, Settings, Bell } from 'lucide-react';
import API from '../config';

const AdminPanel = ({ user }) => {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' });
  const [error, setError] = useState('');

  const token = localStorage.getItem('sr_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const roleColors = { ADMIN: '#ef4444', MASTER: '#3b82f6', NAZORATCHI: '#22c55e', MECHANIC: '#f59e0b', ELECTRIC: '#06b6d4', UZLAVYAZ: '#a855f7' };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/users`, { headers });
      if (res.ok) setUsers(await res.json());
    } catch (e) {}
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API}/settings`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (e) {}
  };

  useEffect(() => { fetchUsers(); fetchSettings(); }, []);

  const saveSettingsMethod = async (newSettings) => {
    try {
      await fetch(`${API}/settings`, { method: 'PUT', headers, body: JSON.stringify(newSettings) });
      setSettings({ ...settings, ...newSettings });
    } catch (e) {}
  };

  const handleSaveRoleSections = async (role, sections) => {
    try {
      await fetch(`${API}/settings/role-sections`, { method: 'PUT', headers, body: JSON.stringify({ role, sections }) });
      setSettings(prev => ({ ...prev, role_sections: { ...prev.role_sections, [role]: sections } }));
    } catch (e) {}
  };

  const allSections = [
    { id: 'dashboard', label: 'Stanok' },
    { id: 'mechanic', label: 'Mexanik' },
    { id: 'uzlavyaz', label: 'Asnova' },
    { id: 'system', label: 'Tizim' },
    { id: 'master', label: 'Operatorlar' },
    { id: 'nazoratchi', label: 'Dam Kun' },
    { id: 'users', label: 'Foydalanuvchilar' },
    { id: 'reports', label: 'Hisobotlar' },
  ];

  const roles = ['MASTER', 'NAZORATCHI', 'MECHANIC', 'ELECTRIC', 'UZLAVYAZ'];

  const handleCreate = async () => {
    setError('');
    try {
      const res = await fetch(`${API}/users`, { method: 'POST', headers, body: JSON.stringify(form) });
      if (res.ok) { setShowForm(false); setForm({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' }); fetchUsers(); }
      else { const d = await res.json(); setError(d.detail || 'Xatolik'); }
    } catch (e) { setError('Server xatoligi'); }
  };

  const handleUpdate = async () => {
    try {
      const body = { full_name: form.full_name, role: form.role };
      if (form.password) body.password = form.password;
      await fetch(`${API}/users/${editId}`, { method: 'PUT', headers, body: JSON.stringify(body) });
      setEditId(null); fetchUsers();
    } catch (e) {}
  };

  const handleDelete = async (id) => {
    if (!confirm('Ochirishni tasdiqlaysizmi?')) return;
    try { await fetch(`${API}/users/${id}`, { method: 'DELETE', headers }); fetchUsers(); } catch (e) {}
  };

  const handleToggleSection = (role, sectionId) => {
    const current = settings.role_sections?.[role] || [];
    const updated = current.includes(sectionId) ? current.filter(s => s !== sectionId) : [...current, sectionId];
    handleSaveRoleSections(role, updated);
  };

  const inputStyle = { padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--panel-border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.9rem', outline: 'none' };
  const tabStyle = { padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' };

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px' }}>
        <button onClick={() => setTab('users')} style={{ ...tabStyle, background: tab === 'users' ? 'var(--primary)' : 'transparent', color: tab === 'users' ? '#0a0f1a' : 'var(--text-muted)' }}>
          Foydalanuvchilar
        </button>
        <button onClick={() => setTab('settings')} style={{ ...tabStyle, background: tab === 'settings' ? 'var(--primary)' : 'transparent', color: tab === 'settings' ? '#0a0f1a' : 'var(--text-muted)' }}>
          <Settings size={16} /> Sozlamalar
        </button>
      </div>

      {tab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Foydalanuvchilar</h2>
            <button onClick={() => { setShowForm(true); setEditId(null); setForm({ username: '', password: '', full_name: '', role: 'MASTER', shift_type: 'KUNDUZ' }); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
              <Plus size={16} /> Yangi
            </button>
          </div>

          {showForm && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              {error && <div style={{ color: '#ef4444', marginBottom: '12px', fontWeight: 600 }}>{error}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <input placeholder="Login" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} style={inputStyle} />
                <input placeholder="Parol" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={inputStyle} />
                <input placeholder="To'liq ism" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} style={inputStyle} />
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                  <option value="MASTER">Master</option>
                  <option value="NAZORATCHI">Nazoratchi</option>
                  <option value="MECHANIC">Mexanik</option>
                  <option value="ELECTRIC">Elektrik</option>
                  <option value="UZLAVYAZ">Uzlavyaz</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button onClick={handleCreate} style={{ ...inputStyle, background: 'var(--primary)', color: '#fff', cursor: 'pointer', border: 'none', fontWeight: 700 }}>
                  <Save size={14} /> Yaratish
                </button>
                <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ ...inputStyle, cursor: 'pointer', border: '1px solid var(--panel-border)' }}>
                  <X size={14} /> Bekor
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gap: '10px' }}>
            {users.map(u => (
              <div key={u.id} style={{ background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{u.full_name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{u.username}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ background: `${roleColors[u.role] || '#888'}22`, color: roleColors[u.role] || '#888', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}>{u.role}</span>
                  <button onClick={() => { setEditId(u.id); setForm({ username: u.username, password: '', full_name: u.full_name, role: u.role, shift_type: u.shift_type || 'KUNDUZ' }); setShowForm(true); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(u.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div>
          <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: 800 }}><Settings size={24} /> Rol Sozlamalari</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Har bir rol uchun qaysi bo'limlar ko'rinishini sozlang</p>
          
          {roles.map(role => (
            <div key={role} style={{ background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem', marginBottom: '12px' }}>
              <div style={{ fontWeight: 800, marginBottom: '8px', color: roleColors[role] }}>{role}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {allSections.map(section => {
                  const isSelected = (settings.role_sections?.[role] || []).includes(section.id);
                  return (
                    <button key={section.id} onClick={() => handleToggleSection(role, section.id)} style={{
                      padding: '6px 12px', borderRadius: '8px',
                      border: `2px solid ${isSelected ? '#22c55e' : 'var(--panel-border)'}`,
                      background: isSelected ? 'rgba(34,197,94,0.15)' : 'transparent',
                      color: isSelected ? '#22c55e' : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
                    }}>
                      {isSelected ? '✓ ' : '+ '}{section.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <h2 style={{ margin: '2rem 0 1rem 0', fontSize: '1.2rem', fontWeight: 800 }}><Bell size={20} /> Bildirishnomalar</h2>
          <div style={{ background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Ko'rinish vaqti (soniya)</label>
            <input type="number" value={settings.notification_duration || 10} onChange={e => saveSettingsMethod({ notification_duration: parseInt(e.target.value) })} style={{ ...inputStyle, width: '100px' }} />
          </div>

          <h2 style={{ margin: '2rem 0 1rem 0', fontSize: '1.2rem', fontWeight: 800 }}>📢 Banner</h2>
          <div style={{ background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <input type="checkbox" checked={settings.banner_enabled || false} onChange={e => {
                fetch(`${API}/settings/banner`, { method: 'PUT', headers, body: JSON.stringify({ enabled: e.target.checked, message: settings.banner_message || '' }) });
                setSettings(s => ({ ...s, banner_enabled: e.target.checked }));
              }} />
              <span style={{ fontWeight: 600 }}>Banner yoqish</span>
            </label>
            <input placeholder="Banner matni..." value={settings.banner_message || ''} onChange={e => setSettings(s => ({ ...s, banner_message: e.target.value }))} style={{ ...inputStyle, width: '100%', marginBottom: '8px' }} />
            <button onClick={() => {
              fetch(`${API}/settings/banner`, { method: 'PUT', headers, body: JSON.stringify({
                enabled: settings.banner_enabled,
                message: settings.banner_message,
                duration: settings.banner_duration || 5,
                color: settings.banner_color || '#00d2ff',
                background: settings.banner_bg || 'rgba(0,210,255,0.15)'
              }) });
            }} style={{ ...inputStyle, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 700 }}>
              Saqlash
            </button>
          </div>

          <h2 style={{ margin: '2rem 0 1rem 0', fontSize: '1.2rem', fontWeight: 800 }}>🏢 Logo va Nomi</h2>
          <div style={{ background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Logo qisqartmasi</label>
            <input placeholder="SR" value={settings.logo_text || 'SR'} onChange={e => setSettings(s => ({ ...s, logo_text: e.target.value }))} style={{ ...inputStyle, width: '100px', marginBottom: '12px' }} />
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Kompaniya nomi</label>
            <input placeholder="FazoLuxe" value={settings.company_name || 'FazoLuxe'} onChange={e => setSettings(s => ({ ...s, company_name: e.target.value }))} style={{ ...inputStyle, width: '100%', marginBottom: '12px' }} />
            <button onClick={() => {
              fetch(`${API}/settings`, { method: 'PUT', headers, body: JSON.stringify({ logo_text: settings.logo_text, company_name: settings.company_name }) });
            }} style={{ ...inputStyle, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 700 }}>
              Saqlash
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
