import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Link, Users, Edit2, Check, X } from 'lucide-react';
import { emitRefresh } from '../utils/events';
import API from '../config';

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}

const MasterPanel = ({ user }) => {
  const [operators, setOperators] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [restingToday, setRestingToday] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [addFormClosing, setAddFormClosing] = useState(false);
  const [assignClosing, setAssignClosing] = useState(false);
  const [shiftType, setShiftType] = useState('KUNDUZ');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [newOp, setNewOp] = useState({ name: '', phone: '', position: 'Operator', shift_type: 'KUNDUZ' });
  const [editingOperator, setEditingOperator] = useState(null);
  const [editOpForm, setEditOpForm] = useState({ name: '', phone: '', position: 'Operator', shift_type: 'KUNDUZ' });

  const handleOpenEdit = (op) => {
    setEditingOperator(op.id);
    setEditOpForm({
      name: op.name,
      phone: op.phone || '',
      position: op.position || 'Operator',
      shift_type: op.shift_type || 'KUNDUZ'
    });
  };

  const handleSaveEdit = async () => {
    try {
      await fetch(`${API}/operators/${editingOperator}`, {
        method: 'PUT', headers,
        body: JSON.stringify(editOpForm)
      });
      setEditingOperator(null);
      fetchData();
      emitRefresh();
    } catch (e) {}
  };

  const handleCancelEdit = () => {
    setEditingOperator(null);
  };

  const handleCloseAddForm = () => {
    setAddFormClosing(true);
    setTimeout(() => {
      setShowAddForm(false);
      setAddFormClosing(false);
    }, 250);
  };

  const handleCloseAssign = () => {
    setAssignClosing(true);
    setTimeout(() => {
      setShowAssign(false);
      setAssignClosing(false);
      setSelectedMachines([]);
    }, 250);
  };

  const token = localStorage.getItem('sr_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const allMachineIds = Array.from({ length: 68 }, (_, i) => `S${i + 1}`);

  const fetchData = async () => {
    try {
      const [opsRes, asgRes, restRes] = await Promise.all([
        fetch(`${API}/operators`, { headers }),
        fetch(`${API}/assignments`, { headers }),
        fetch(`${API}/rest-days/today`, { headers }),
      ]);
      if (opsRes.ok) setOperators(await opsRes.json());
      if (asgRes.ok) setAssignments(await asgRes.json());
      if (restRes.ok) setRestingToday(await restRes.json());
    } catch (e) {}
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const h = () => { fetchData(); };
    window.addEventListener('app-refresh', h);
    return () => window.removeEventListener('app-refresh', h);
  }, []);

  const handleAddOperator = async () => {
    if (!newOp.name.trim()) return;
    try {
      const res = await fetch(`${API}/operators`, {
        method: 'POST', headers, body: JSON.stringify(newOp)
      });
      if (res.ok) {
        setNewOp({ name: '', phone: '', position: 'Operator', shift_type: 'KUNDUZ' });
        setShowAddForm(false);
        fetchData();
      }
    } catch (e) {}
  };

  const handleDeleteOperator = async (id) => {
    if (!confirm('O\'chirishni tasdiqlaysizmi?')) return;
    try {
      await fetch(`${API}/operators/${id}`, { method: 'DELETE', headers });
      fetchData();
    } catch (e) {}
  };

  const handleAssign = async () => {
    if (!selectedOperator || selectedMachines.length === 0) return;
    try {
      await fetch(`${API}/assignments`, {
        method: 'POST', headers,
        body: JSON.stringify({ operator_id: parseInt(selectedOperator), machine_ids: selectedMachines, shift_type: shiftType })
      });
      setSelectedMachines([]);
      setShowAssign(false);
      fetchData();
      emitRefresh();
    } catch (e) {}
  };

  const handleUnassign = async (id) => {
    try {
      await fetch(`${API}/assignments/${id}`, { method: 'DELETE', headers });
      fetchData();
      emitRefresh();
    } catch (e) {}
  };

  const handleUnassignAll = async (opId) => {
    if (!confirm('Barcha stanoklarni ochirishni tasdiqlaysizmi?')) return;
    try {
      const opAssignments = assignments.filter(a => a.operator_id === opId && a.is_active === 1);
      for (const a of opAssignments) {
        await fetch(`${API}/assignments/${a.id}`, { method: 'DELETE', headers });
      }
      fetchData();
      emitRefresh();
    } catch (e) {}
  };

  const isResting = (opId) => restingToday.some(r => r.operator_id === opId);

  const workers = operators.filter(o => o.is_active);
  const assignableOperators = workers.filter(o => o.position === 'Operator' || !o.position);

  const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' };
  const tdStyle = { padding: '12px 16px', fontSize: '0.85rem', fontWeight: 500 };
  const labelStyle = { fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 };
  const actionBtnStyle = (color) => ({ padding: '6px', borderRadius: '6px', border: 'none', background: `${color}22`, color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' });
  const tableCardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' };

  const [activeTab, setActiveTab] = useState('operators');

  const tabs = [
    { id: 'operators', label: 'Ishchilar', icon: <Users size={18} /> },
  ];

  const openAssignForm = (opId, opShiftType) => {
    setSelectedOperator(String(opId));
    setShiftType(opShiftType || 'KUNDUZ');
    setSelectedMachines([]);
    setShowAssign(true);
  };

  const toggleMachine = (mId) => {
    setSelectedMachines(prev => prev.includes(mId) ? prev.filter(x => x !== mId) : [...prev, mId]);
  };

  const renderWorkerRow = (op, shiftColor) => {
    const opAsgs = assignments.filter(a => a.operator_id === op.id && a.is_active === 1);
    const resting = isResting(op.id);
    const isOperator = op.position === 'Operator' || !op.position;
    const isEditing = editingOperator === op.id;

    if (isEditing) {
      return (
        <tr key={op.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(168,85,247,0.1)' }}>
          <td style={tdStyle} colSpan={2}>
            <input 
              value={editOpForm.name} 
              onChange={e => setEditOpForm({...editOpForm, name: e.target.value})}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: '6px', color: 'white', width: '100%' }}
              placeholder="Ism"
            />
          </td>
          <td style={tdStyle}>
            <input 
              value={editOpForm.phone} 
              onChange={e => setEditOpForm({...editOpForm, phone: e.target.value})}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: '6px', color: 'white', width: '120px' }}
              placeholder="Telefon"
            />
          </td>
          <td style={tdStyle}>
            <select 
              value={editOpForm.shift_type} 
              onChange={e => setEditOpForm({...editOpForm, shift_type: e.target.value})}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px', borderRadius: '6px', color: 'white' }}
            >
              <option value="KUNDUZ">☀️ Kunduzgi</option>
              <option value="TUNGI">🌙 Tungi</option>
            </select>
          </td>
          <td style={tdStyle} colSpan={2}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={handleSaveEdit} style={{ ...actionBtnStyle('#22c55e'), padding: '6px 12px' }}>
                <Check size={14} /> Saqlash
              </button>
              <button onClick={handleCancelEdit} style={{ ...actionBtnStyle('#64748b'), padding: '6px 12px' }}>
                <X size={14} /> Bekor
              </button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr key={op.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        <td style={tdStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: `${shiftColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 800, color: shiftColor
            }}>{op.name.charAt(0).toUpperCase()}</div>
            <div>
              <span style={{ fontWeight: 600 }}>{op.name}</span>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{op.position || 'Operator'}</div>
            </div>
          </div>
        </td>
        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{op.phone || '-'}</td>
        <td style={tdStyle}>
          {isOperator ? (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              {opAsgs.map(a => (
                <span key={a.id} style={{
                  padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
                  background: 'rgba(168,85,247,0.15)', color: '#a855f7', cursor: 'pointer'
                }} onClick={() => handleUnassign(a.id)} title="Olib tashlash uchun bosing">
                  {a.machine_id} ×
                </span>
              ))}
              <button onClick={() => openAssignForm(op.id, op.shift_type)} style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700,
                background: 'rgba(0,210,255,0.15)', color: '#00d2ff', border: 'none', cursor: 'pointer'
              }}>
                <Link size={10} style={{ marginRight: '2px' }} /> Biriktirish
              </button>
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
          )}
        </td>
        <td style={tdStyle}>
          {resting ? (
            <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Dam olish</span>
          ) : (
            <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Ishda</span>
          )}
        </td>
        <td style={tdStyle}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => handleOpenEdit(op)} style={actionBtnStyle('#38bdf8')} title="Tahrirlash">
              <Edit2 size={14} />
            </button>
            {opAsgs.length > 0 && (
              <button onClick={() => handleUnassignAll(op.id)} style={actionBtnStyle('#f59e0b')} title="Barchasini ochirish">
                <Link size={14} />
              </button>
            )}
            <button onClick={() => handleDeleteOperator(op.id)} style={actionBtnStyle('#ef4444')} title="O'chirish">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="panel-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
          <Users size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Ishchilar Boshqaruvi
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(user.role === 'MASTER' || user.role === 'ADMIN' || user.role === 'NAZORATCHI') && (
            <button onClick={() => setShowAddForm(!showAddForm)} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
              background: 'var(--primary)', color: '#0a0f1a', border: 'none', borderRadius: '10px',
              cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem'
            }}>
              <Plus size={16} /> Yangi Ishchi
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
            borderRadius: '10px', border: activeTab === tab.id ? '2px solid var(--primary)' : '1px solid var(--panel-border)',
            background: activeTab === tab.id ? 'rgba(0,210,255,0.1)' : 'transparent',
            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', transition: '0.2s'
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '16px',
          padding: '1.5rem', marginBottom: '1.5rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700 }}>Yangi Ishchi Qo'shish</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Ism</label>
              <input className="input-field" style={{ marginTop: '4px' }} value={newOp.name} onChange={e => setNewOp({ ...newOp, name: e.target.value })} placeholder="Ism" />
            </div>
            <div>
              <label style={labelStyle}>Telefon</label>
              <input className="input-field" style={{ marginTop: '4px' }} value={newOp.phone} onChange={e => setNewOp({ ...newOp, phone: e.target.value })} placeholder="+998..." />
            </div>
            <div>
              <label style={labelStyle}>Lavozim</label>
              <select className="input-field" style={{ marginTop: '4px' }} value={newOp.position} onChange={e => setNewOp({ ...newOp, position: e.target.value })}>
                <option value="Operator">Operator</option>
                <option value="Master">Master</option>
                <option value="Mexanik">Mexanik</option>
                <option value="Uzlavyaz">Uzlavyaz</option>
                <option value="Smena boshlig'i">Smena boshlig'i</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Smenasi</label>
              <select className="input-field" style={{ marginTop: '4px' }} value={newOp.shift_type} onChange={e => setNewOp({ ...newOp, shift_type: e.target.value })}>
                <option value="KUNDUZ">☀️ Kunduzgi</option>
                <option value="TUNGI">🌙 Tungi</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
            <button onClick={handleAddOperator} style={{
              padding: '10px 20px', background: 'var(--primary)', color: '#0a0f1a',
              border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700
            }}>Saqlash</button>
            <button onClick={handleCloseAddForm} style={{
              padding: '10px 20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
              border: '1px solid var(--panel-border)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600
            }}>Bekor</button>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssign && (
        <div className={`modal-overlay ${assignClosing ? 'modal-exit' : ''}`} onClick={handleCloseAssign}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800 }}>
              Stanok Biriktirish — {operators.find(o => o.id === parseInt(selectedOperator))?.name || ''}
            </h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
              <select className="input-field" value={shiftType} onChange={e => setShiftType(e.target.value)}>
                <option value="KUNDUZ">☀️ Kunduzgi</option>
                <option value="TUNGI">🌙 Tungi</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '300px', overflowY: 'auto', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
              {allMachineIds.map(mId => {
                const isSelected = selectedMachines.includes(mId);
                
                // Check if assigned in this shift
                const isAssignedSameShift = assignments.some(a => 
                  a.machine_id === mId && 
                  a.is_active === 1 &&
                  a.shift_type === shiftType
                );
                
                // If already assigned in this shift, show as blocked (qizil)
                if (isAssignedSameShift) {
                  return (
                    <button key={mId} style={{
                      padding: '6px 12px', borderRadius: '8px',
                      border: '2px solid rgba(255,49,49,0.4)',
                      background: 'rgba(255,49,49,0.1)',
                      color: '#ff3131',
                      cursor: 'not-allowed', fontWeight: 700, fontSize: '0.75rem',
                      opacity: 0.6
                    }}>
                      {mId}
                    </button>
                  );
                }
                
                // Available machines
                return (
                  <button key={mId} onClick={() => toggleMachine(mId)} style={{
                    padding: '6px 12px', borderRadius: '8px',
                    border: `2px solid ${isSelected ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
                    background: isSelected ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.03)',
                    color: isSelected ? '#a855f7' : 'var(--text-muted)',
                    cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem',
                    opacity: 1
                  }}>
                    {isSelected ? '✓ ' : ''}{mId}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button onClick={handleAssign} disabled={selectedMachines.length === 0} style={{
                flex: 1, padding: '12px', background: selectedMachines.length === 0 ? 'rgba(168,85,247,0.3)' : '#a855f7',
                color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700
              }}>Biriktirish ({selectedMachines.length})</button>
              <button onClick={handleCloseAssign} style={{
                padding: '12px 20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                border: '1px solid var(--panel-border)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600
              }}>Bekor</button>
            </div>
          </div>
        </div>
      )}

      {/* Operators Tab */}
      {activeTab === 'operators' && (
        <div>
          {['KUNDUZ', 'TUNGI'].map(shift => {
            const shiftWorkers = workers.filter(w => w.shift_type === shift);
            const shiftColor = shift === 'KUNDUZ' ? '#f59e0b' : '#6366f1';
            const shiftLabel = shift === 'KUNDUZ' ? '☀️ Kunduzgi Smena' : '🌙 Tungi Smena';
            return (
              <div key={shift} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{
                  fontSize: '1.1rem', fontWeight: 800, color: shiftColor,
                  marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  {shiftLabel}
                  <span style={{
                    fontSize: '0.7rem', background: `${shiftColor}22`, color: shiftColor,
                    padding: '2px 10px', borderRadius: '12px', fontWeight: 700
                  }}>{shiftWorkers.length} ta</span>
                </h3>
                {shiftWorkers.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--panel-border)' }}>
                    Ishchilar yo'q
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                          <th style={thStyle}>Ism</th>
                          <th style={thStyle}>Telefon</th>
                          <th style={thStyle}>Biriktirilgan Stanoklar</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Amallar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shiftWorkers.map(op => renderWorkerRow(op, shiftColor))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MasterPanel;