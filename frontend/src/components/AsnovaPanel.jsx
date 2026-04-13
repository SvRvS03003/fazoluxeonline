import React, { useState, useEffect } from 'react';
import { Package, Download, RefreshCw } from 'lucide-react';
import API from '../config';

const AsnovaPanel = ({ user }) => {
  const token = localStorage.getItem('sr_token');
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchMachines = async () => {
    try {
      const res = await fetch(`${API}/machines`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMachines(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchMachines();
    const interval = setInterval(fetchMachines, 5000);
    return () => clearInterval(interval);
  }, []);

  const getAsnovaRemaining = (m) => {
    return Math.max(0, (m.initial_asnova_length || 0) - ((m.current_total_meters || 0) - (m.meters_at_fill || 0)));
  };

  const totalAsnova = machines.reduce((sum, m) => sum + getAsnovaRemaining(m), 0);

  const downloadPDF = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/reports/asnova-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ machines: machines.map(m => ({ id: m.id, remaining: getAsnovaRemaining(m) })) })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asnova_qoldigi_${new Date().toISOString().split('T')[0]}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {}
    setLoading(false);
  };

  const downloadExcel = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/reports/asnova-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ machines: machines.map(m => ({ id: m.id, remaining: getAsnovaRemaining(m) })) })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `asnova_qoldigi_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {}
    setLoading(false);
  };

  const getStatusColor = (m) => {
    const remaining = getAsnovaRemaining(m);
    if (remaining <= 0) return '#ff3131';
    if (remaining < 500) return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div className="panel-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
          <Package size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Asnova Qoldigi
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchMachines} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
            background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--panel-border)',
            borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem'
          }}>
            <RefreshCw size={16} /> Yangilash
          </button>
          <button onClick={downloadExcel} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
            background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'none',
            borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem'
          }}>
            <Download size={16} /> Excel
          </button>
          <button onClick={downloadPDF} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
            background: 'rgba(0,210,255,0.15)', color: '#00d2ff', border: 'none',
            borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem'
          }}>
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, rgba(0,210,255,0.1), rgba(168,85,247,0.1))',
        border: '1px solid rgba(0,210,255,0.3)', borderRadius: '16px',
        padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center'
      }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
          Jami Asnova Qoldigi
        </div>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#00d2ff', fontFamily: 'monospace' }}>
          {totalAsnova.toFixed(1)} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>m</span>
        </div>
      </div>

      <div className="machines-grid">
        {machines.map(m => {
          const remaining = getAsnovaRemaining(m);
          const color = getStatusColor(m);
          const isOnline = m.status !== 'OFFLINE';
          return (
            <div key={m.id} style={{
              background: 'var(--card)', border: `1px solid ${color}44`,
              borderRadius: '10px', padding: '10px 8px', textAlign: 'center',
              transition: '0.2s', minHeight: '90px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: isOnline ? '#22c55e' : '#ff3131',
                  boxShadow: `0 0 4px ${isOnline ? '#22c55e' : '#ff3131'}`
                }} />
                <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>{m.id}</span>
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color, fontFamily: 'monospace' }}>
                {remaining.toFixed(0)}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 600 }}>metr</div>
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="modal-overlay">
          <div style={{ color: 'var(--primary)', fontSize: '1.2rem', fontWeight: 800 }}>
            Yuklanmoqda...
          </div>
        </div>
      )}
    </div>
  );
};

export default AsnovaPanel;