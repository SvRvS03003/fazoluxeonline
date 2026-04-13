import React, { useState, useEffect, useRef } from 'react';
import { Wrench, Clock, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { emitRefresh } from '../utils/events';
import API from '../config';

const SIGNAL_TYPES = [
  { value: 'MECHANIC', label: 'Mexanik', color: '#f59e0b', icon: '🔧' },
  { value: 'ELECTRIC', label: 'Elektrik', color: '#3b82f6', icon: '⚡' },
  { value: 'ASNOVA', label: 'Asnova', color: '#a855f7', icon: '🧵' },
];

const REASONS = {
  MECHANIC: [
    'Kamar uzildi', 'Galtak buzildi', 'Encoder buzildi', 'Podshipnik yemirildi',
    "Yog' yetishmayapti", "Tishli g'ildirak buzildi", 'Servomotor hatoligi', 'Boshqa'
  ],
  ELECTRIC: [
    'Motor ishlamayabdi', 'Tugmalar ishlamaybdi', 'Sensor ishlamayapti',
    'Magnit ishlamayabdi', 'Boshqa'
  ],
  ASNOVA: [
    'Asnova tugadi', 'Asnova yirtildi', "Asnova sifatsiz",
    "Asnova o'rnatilmagan", 'Boshqa'
  ],
};

const DIRECTIONS = {
  MECHANIC: [
    { value: 'MECHANIC', label: 'Mexanik', icon: '🔧' },
    { value: 'ELECTRIC', label: 'Elektrik', icon: '⚡' },
    { value: 'UZLAVYAZ', label: 'Uzlavyaz', icon: '🧵' },
  ],
  ELECTRIC: [
    { value: 'ELECTRIC', label: 'Elektrik', icon: '⚡' },
    { value: 'MECHANIC', label: 'Mexanik', icon: '🔧' },
    { value: 'UZLAVYAZ', label: 'Uzlavyaz', icon: '🧵' },
  ],
  ASNOVA: [
    { value: 'UZLAVYAZ', label: 'Uzlavyaz', icon: '🧵' },
    { value: 'MASTER', label: 'Master', icon: '👔' },
    { value: 'NAZORATCHI', label: 'Nazoratchi', icon: '🛡️' },
  ],
};

const MechanicPanel = ({ user }) => {
  const [calls, setCalls] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [showCallForm, setShowCallForm] = useState(false);
  const [callForm, setCallForm] = useState({ machine_id: '', signal_type: 'MECHANIC' });
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [customReason, setCustomReason] = useState('');
  const [showReasons, setShowReasons] = useState(false);
  const [forwardCall, setForwardCall] = useState(null);
  const [forwardReasons, setForwardReasons] = useState([]);
  const [forwardCustomReason, setForwardCustomReason] = useState('');
  const prevCallsRef = useRef([]);

  const token = localStorage.getItem('sr_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const playAlert = (signalType) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const frequencies = { MECHANIC: [523, 659, 784], ELECTRIC: [659, 830, 988], ASNOVA: [523, 659, 784] };
      const freqs = frequencies[signalType] || frequencies.MECHANIC;
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0;
        osc.frequency.value = freq;
        osc.type = 'sine';
        const startTime = ctx.currentTime + i * 0.15;
        osc.start(startTime);
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
        gain.gain.linearRampToValueAtTime(0.1, startTime + 0.3);
        gain.gain.linearRampToValueAtTime(0.001, startTime + 0.5);
        osc.stop(startTime + 0.5);
      });
    } catch (e) {}
  };

  const fetchCalls = async () => {
    try {
      const res = await fetch(`${API}/mechanic-calls`, { headers });
      if (res.ok) {
        const data = await res.json();
        const newPending = data.filter(c => c.status === 'PENDING');
        const oldPending = prevCallsRef.current.filter(c => c.status === 'PENDING');
        if (newPending.length > oldPending.length) {
          const newCall = newPending.find(nc => !oldPending.some(oc => oc.id === nc.id));
          if (newCall) playAlert(newCall.signal_type || 'MECHANIC');
        }
        prevCallsRef.current = data;
        setCalls(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchCalls();
    const i = setInterval(fetchCalls, 3000);
    const h = () => fetchCalls();
    window.addEventListener('app-refresh', h);
    return () => { clearInterval(i); window.removeEventListener('app-refresh', h); };
  }, []);

  const updateStatus = async (id, status) => {
    try {
      await fetch(`${API}/mechanic-calls/${id}`, {
        method: 'PUT', headers, body: JSON.stringify({ status })
      });
      fetchCalls();
      emitRefresh();
    } catch (e) {}
  };

  const handleForward = async (callId, newSignalType, customReason) => {
    try {
      await fetch(`${API}/mechanic-calls/${callId}`, {
        method: 'PUT', headers, body: JSON.stringify({ 
          status: 'PENDING', 
          signal_type: newSignalType,
          reason: customReason || 'Yo\'naltirildi'
        })
      });
      setForwardCall(null);
      fetchCalls();
      emitRefresh();
    } catch (e) {}
  };

  const handleCreateCall = async () => {
    if (!callForm.machine_id) return;
    let reason = selectedReasons.filter(r => r !== 'Boshqa').join(', ');
    if (customReason) reason += (reason ? ', ' : '') + customReason;
    if (!reason) return;
    try {
      const res = await fetch(`${API}/mechanic-calls`, {
        method: 'POST', headers, body: JSON.stringify({ ...callForm, reason })
      });
      if (res.ok) {
        setCallForm({ machine_id: '', signal_type: 'MECHANIC' });
        setSelectedReasons([]);
        setCustomReason('');
        setShowReasons(false);
        setShowCallForm(false);
        fetchCalls();
        emitRefresh();
      }
    } catch (e) {}
  };

  const toggleReason = (reason) => {
    if (reason === 'Boshqa') {
      setSelectedReasons(prev => prev.includes('Boshqa') ? [] : ['Boshqa']);
      setCustomReason('');
    } else {
      setSelectedReasons(prev =>
        prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev.filter(r => r !== 'Boshqa'), reason]
      );
    }
  };

  const handleSignalChange = (type) => {
    setCallForm({ ...callForm, signal_type: type });
    setSelectedReasons([]);
    setCustomReason('');
    setShowReasons(true);
  };

  const statusColors = {
    PENDING: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', icon: <Clock size={14} /> },
    IN_PROGRESS: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', icon: <Wrench size={14} /> },
    RESOLVED: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', icon: <CheckCircle size={14} /> },
  };

  const filtered = filter === 'ALL' ? calls : calls.filter(c => c.status === filter);
  const pendingCount = calls.filter(c => c.status === 'PENDING').length;
  const allMachineIds = Array.from({ length: 68 }, (_, i) => `S${i + 1}`);

  const canForward = (call) => {
    if (call.status !== 'PENDING' && call.status !== 'IN_PROGRESS') return false;
    return ['MECHANIC', 'ELECTRIC', 'ASNOVA', 'ADMIN', 'MASTER', 'NAZORATCHI', 'UZLAVYAZ'].includes(user.role);
  };

  const forwardTargets = (call) => {
    const targets = [];
    if (call.signal_type === 'MECHANIC') {
      targets.push({ value: 'ELECTRIC', label: 'Elektrikga', icon: '⚡', reasons: [{ value: 'e1', reason: 'electrik ishi bor', color: '#06b6d4' }]});
      targets.push({ value: 'ASNOVA', label: 'Uzlavyazga', icon: '🧵', reasons: [{ value: 'a1', reason: 'uzlavyaz ishi bor', color: '#a855f7' }]});
    } else if (call.signal_type === 'ELECTRIC') {
      targets.push({ value: 'MECHANIC', label: 'Mexanikka', icon: '🔧', reasons: [{ value: 'm1', reason: 'mexanik muammosi aniqlandi', color: '#f59e0b' }]});
      targets.push({ value: 'ASNOVA', label: 'Uzlavyazga', icon: '🧵', reasons: [{ value: 'a2', reason: 'uzlavyaz ishi bor', color: '#a855f7' }]});
    } else if (call.signal_type === 'ASNOVA') {
      targets.push({ value: 'MECHANIC', label: 'Mexanikka', icon: '🔧', reasons: [{ value: 'm2', reason: 'mexanik muammosi aniqlandi', color: '#f59e0b' }]});
      targets.push({ value: 'ELECTRIC', label: 'Elektrikga', icon: '⚡', reasons: [{ value: 'e2', reason: 'electrik ishi bor', color: '#06b6d4' }]});
    }
    return targets;
  };

  const getDirectionLabel = (dir) => {
    const allDirs = [...DIRECTIONS.MECHANIC, ...DIRECTIONS.ASNOVA];
    const found = allDirs.find(d => d.value === dir);
    return found ? found.label : dir;
  };

  return (
    <div className="panel-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Wrench size={24} />
          Chaqiruvlar
          {pendingCount > 0 && (
            <span style={{
              background: '#ef4444', color: 'white', borderRadius: '50%',
              width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 800, animation: 'pulse 1.5s infinite'
            }}>{pendingCount}</span>
          )}
        </h2>
        {(user.role === 'MASTER' || user.role === 'ADMIN' || user.role === 'NAZORATCHI' || user.role === 'UZLAVYAZ') && (
          <button onClick={() => { setShowCallForm(!showCallForm); setShowReasons(false); setSelectedReasons([]); setCustomReason(''); }} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
            background: '#ef4444', color: 'white', border: 'none', borderRadius: '10px',
            cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem'
          }}>
            <AlertTriangle size={16} /> Chaqiruv Yuborish
          </button>
        )}
      </div>

      {showCallForm && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--panel-border)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 700 }}>Yangi Chaqiruv</h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Stanok</label>
            <select className="input-field" style={{ marginTop: '4px' }} value={callForm.machine_id} onChange={e => setCallForm({ ...callForm, machine_id: e.target.value })}>
              <option value="">Tanlang...</option>
              {allMachineIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Signal Turi</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', marginBottom: '1rem' }}>
            {SIGNAL_TYPES.map(st => (
              <button key={st.value} onClick={() => handleSignalChange(st.value)} style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: '2px solid',
                borderColor: callForm.signal_type === st.value ? st.color : 'rgba(255,255,255,0.1)',
                background: callForm.signal_type === st.value ? `${st.color}22` : 'rgba(255,255,255,0.03)',
                color: callForm.signal_type === st.value ? st.color : 'var(--text-muted)',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{st.icon}</div>
                {st.label}
              </button>
            ))}
          </div>
          <div style={{ maxHeight: showReasons ? '800px' : '0', overflow: 'hidden', transition: 'max-height 0.4s ease, opacity 0.3s ease', opacity: showReasons ? 1 : 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
              {(REASONS[callForm.signal_type] || []).map(reason => {
                const isSelected = selectedReasons.includes(reason);
                return (
                  <button key={reason} onClick={() => toggleReason(reason)} style={{
                    padding: '8px 16px', borderRadius: '20px',
                    border: `2px solid ${isSelected ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                    background: isSelected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                    color: isSelected ? '#22c55e' : 'var(--text-muted)',
                    cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem'
                  }}>{isSelected ? '✓ ' : ''}{reason}</button>
                );
              })}
            </div>
            {selectedReasons.includes('Boshqa') && (
              <div style={{ marginTop: '0.75rem' }}>
                <input className="input-field" style={{ marginTop: '4px' }} value={customReason} onChange={e => setCustomReason(e.target.value)} placeholder="Sababni yozing..." autoFocus />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
            <button onClick={handleCreateCall} disabled={!callForm.machine_id || (selectedReasons.length === 0 && !customReason)} style={{ padding: '10px 20px', background: (!callForm.machine_id || (selectedReasons.length === 0 && !customReason)) ? 'rgba(239,68,68,0.3)' : '#ef4444', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>Yuborish</button>
            <button onClick={() => { setShowCallForm(false); setShowReasons(false); setSelectedReasons([]); setCustomReason(''); }} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--panel-border)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>Bekor</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['ALL', 'PENDING', 'IN_PROGRESS', 'RESOLVED'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '8px 16px', borderRadius: '8px', border: filter === s ? '2px solid var(--primary)' : '1px solid var(--panel-border)', background: filter === s ? 'rgba(0,210,255,0.1)' : 'transparent', color: filter === s ? 'var(--primary)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
            {s === 'ALL' ? 'Hammasi' : s === 'PENDING' ? 'Kutilmoqda' : s === 'IN_PROGRESS' ? 'Jarayonda' : 'Hal qilingan'}
          </button>
        ))}
      </div>

      <div className="table-responsive" style={{ border: 'none', background: 'transparent' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '400px' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <CheckCircle size={40} style={{ marginBottom: '1rem', opacity: 0.5 }} />
              <p>Chaqiruvlar yo'q</p>
            </div>
          )}
          {filtered.map(call => {
            const sc = statusColors[call.status] || statusColors.PENDING;
            const sig = SIGNAL_TYPES.find(s => s.value === call.signal_type) || SIGNAL_TYPES[0];
            return (
              <div key={call.id} style={{ background: 'var(--card)', border: `1px solid ${call.status === 'PENDING' ? sig.color + '44' : 'var(--panel-border)'}`, borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0, background: `${sig.color}22`, color: sig.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>{sig.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      Stanok {call.machine_id}
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 700, background: `${sig.color}22`, color: sig.color }}>{sig.label}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{call.reason || "Sabab ko'rsatilmagan"} — {new Date(call.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: sc.bg, color: sc.color }}>{call.status}</span>
                  {call.status !== 'RESOLVED' && (user.role === 'MECHANIC' || user.role === 'ELECTRIC' || user.role === 'ADMIN') && (
                    <button onClick={() => updateStatus(call.id, call.status === 'PENDING' ? 'IN_PROGRESS' : 'RESOLVED')} style={{ padding: '6px 12px', borderRadius: '8px', background: 'rgba(57,255,20,0.1)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.3)', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>
                      {call.status === 'PENDING' ? 'Boshlash' : 'Tugallash'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MechanicPanel;