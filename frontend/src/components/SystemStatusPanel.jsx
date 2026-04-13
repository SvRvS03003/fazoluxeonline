import React, { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff, AlertTriangle, CheckCircle, XCircle, Server, Clock } from 'lucide-react';
import API from '../config';

const SystemStatusPanel = ({ user }) => {
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchStatus = async () => {
    const token = localStorage.getItem('sr_token');
    try {
      const res = await fetch(`${API}/system/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemStatus(data);
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="system-status">
        <div className="loading">Yuklanmoqda...</div>
      </div>
    );
  }

  const stats = systemStatus || {
    machines_total: 0,
    machines_online: 0,
    machines_running: 0,
    machines_offline: 0,
    machines_asnova_empty: 0,
    machines_no_signal: 0
  };
  const activePercent = stats.machines_total > 0
    ? ((stats.machines_online / stats.machines_total) * 100).toFixed(0)
    : '0';

  return (
    <div className="system-status">
      <div className="sr-dashboard-header">
        <div className="sr-title">
          <h1>Tizim Holati</h1>
          <span className="sr-subtitle">Umumiy ko'rinish</span>
        </div>
        <div className="sr-status">
          <span className="sr-connected">
            <Clock size={14} /> 
            {lastUpdate ? lastUpdate.toLocaleTimeString('uz-UZ') : '-'}
          </span>
        </div>
      </div>

      <div className="sr-stats">
        <div className="sr-stat">
          <Server size={18} />
          <span className="sr-stat-value">{stats.machines_total}</span>
          <span className="sr-stat-label">Jami</span>
        </div>
        <div className="sr-stat sr-running">
          <CheckCircle size={18} />
          <span className="sr-stat-value">{stats.machines_running}</span>
          <span className="sr-stat-label">Ishlaydi</span>
        </div>
        <div className="sr-stat sr-online">
          <Wifi size={18} />
          <span className="sr-stat-value">{stats.machines_online}</span>
          <span className="sr-stat-label">Online</span>
        </div>
        <div className="sr-stat sr-offline">
          <WifiOff size={18} />
          <span className="sr-stat-value">{stats.machines_offline}</span>
          <span className="sr-stat-label">Offline</span>
        </div>
        <div className="sr-stat sr-warning">
          <AlertTriangle size={18} />
          <span className="sr-stat-value">{stats.machines_asnova_empty}</span>
          <span className="sr-stat-label">Asnova tugagan</span>
        </div>
        <div className="sr-stat sr-no-signal">
          <XCircle size={18} />
          <span className="sr-stat-value">{stats.machines_no_signal}</span>
          <span className="sr-stat-label">Signal yo'q</span>
        </div>
      </div>

      <div className="system-info">
        <h3>Tizim Haqida</h3>
        <div className="system-grid">
          <div className="system-item">
            <span className="system-label">Stanoklar</span>
            <span className="system-value">{stats.machines_total} ta</span>
          </div>
          <div className="system-item">
            <span className="system-label">Ishlamaydi</span>
            <span className="system-value offline">{stats.machines_offline} ta</span>
          </div>
          <div className="system-item">
            <span className="system-label">Faol</span>
            <span className="system-value running">{activePercent}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatusPanel;
