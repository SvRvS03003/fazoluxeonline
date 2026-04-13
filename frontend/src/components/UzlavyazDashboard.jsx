import React, { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle, User } from 'lucide-react';
import API from '../config';

const UzlavyazDashboard = ({ user }) => {
  const [emptyMachines, setEmptyMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchEmptyMachines = async () => {
    const token = localStorage.getItem('sr_token');
    try {
      const res = await fetch(`${API}/machines/asnova-empty`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmptyMachines(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmptyMachines();
    const interval = setInterval(fetchEmptyMachines, 5000);
    return () => clearInterval(interval);
  }, []);

const getStatusColor = (item) => {
    if (item.empty_minutes > 15) return '#f97316';
    return '#22c55e';
  };

  const getStatusText = (item) => {
    if (item.empty_minutes > 15) return 'Tugagan';
    return 'Yangi';
  };

  const filteredMachines = emptyMachines.filter(m => {
    if (filter === 'delayed') return m.empty_minutes > 15;
    return true;
  });

  const stats = {
    total: emptyMachines.length,
  };

  const handleFill = async (machineId) => {
    const token = localStorage.getItem('sr_token');
    const length = prompt('Asnova uzunligini kiriting (metr):');
    if (!length || isNaN(parseFloat(length))) return;
    
    try {
      await fetch(`${API}/machines/${machineId}/fill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_asnova_length: parseFloat(length), last_operator_id: user?.id || 1 })
      });
      fetchEmptyMachines();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="uzlavyaz-dashboard">
        <div className="loading">Yuklanmoqda...</div>
      </div>
    );
  }

  return (
    <div className="uzlavyaz-dashboard">
      <div className="sr-dashboard-header">
        <div className="sr-title">
          <h1>Asnova Tugagan Stanoklar</h1>
          <span className="sr-subtitle">Uzlavyaz Monitor</span>
        </div>
      </div>

      <div className="sr-stats">
        <div className="sr-stat">
          <Package size={18} />
          <span className="sr-stat-value">{stats.total}</span>
          <span className="sr-stat-label">Jami tugagan</span>
        </div>
      </div>

      <div className="sr-controls">
        <div className="sr-filters">
          <button className={`sr-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Barchasi</button>
          <button className={`sr-filter-btn ${filter === 'delayed' ? 'active' : ''}`} onClick={() => setFilter('delayed')}>Jami tugaganlar</button>
        </div>
        <button className="sr-refresh-btn" onClick={fetchEmptyMachines}>
          <Package size={16} /> Yangilash
        </button>
      </div>

      <div className="sr-machines-section">
        {filteredMachines.length === 0 ? (
          <div className="sr-empty">
            <CheckCircle size={48} color="#22c55e" />
            <p>Hammu stanoklar ishlaydi! 🎉</p>
          </div>
        ) : (
          <div className="sr-grid">
            {filteredMachines.map(m => (
              <div 
                key={m.id} 
                className="sr-machine-card"
                style={{ borderColor: getStatusColor(m) }}
              >
                <div className="sr-machine-header">
                  <div className="sr-machine-id">{m.id}</div>
                  <div className="sr-machine-timer" style={{ color: getStatusColor(m) }}>
                    <Clock size={14} />
                    {m.empty_minutes} daq
                  </div>
                </div>
                <div className="sr-machine-status" style={{ color: getStatusColor(m) }}>
                  {getStatusText(m)}
                </div>
                {m.uzlavyaz && (
                  <div className="sr-machine-operator">
                    <User size={12} /> {m.uzlavyaz}
                  </div>
                )}
                <button 
                  className="sr-fill-btn" 
                  onClick={() => handleFill(m.id)}
                >
                  Uladim
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UzlavyazDashboard;