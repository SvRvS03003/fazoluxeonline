import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Map, Layers, Play, AlertTriangle, Signal, X, Clock, Settings, Grid, List } from 'lucide-react';
import InteractiveMap from './InteractiveMap';
import API from '../config';
import AnimatedNumber, { WifiSignal } from './AnimatedNumber';

const getStatusColor = (status) => {
  switch (status) {
    case 'RUNNING': return '#22c55e';
    case 'OFFLINE': return '#64748b';
    case 'NO_SIGNAL': return '#a855f7';
    case 'ESP_ONLINE_NO_SIGNAL': return '#a855f7';
    case 'ASNOVA_EMPTY': return '#b45309';
    case 'DISCONNECTED': return '#64748b';
    default: return '#94a3b8';
  }
};

const getStatusText = (status) => {
  switch (status) {
    case 'RUNNING': return 'Ishlaydi';
    case 'OFFLINE': return 'ESP32 Offline';
    case 'NO_SIGNAL': return 'RS485 Signal yo\'q';
    case 'ESP_ONLINE_NO_SIGNAL': return 'RS485 Signal yo\'q';
    case 'ASNOVA_EMPTY': return 'Asnova tugadi';
    case 'DISCONNECTED': return 'Disconnected';
    default: return status;
  }
};

const Dashboard = ({ user }) => {
  const [machines, setMachines] = useState([]);
  const [filter, setFilter] = useState('all');
  const [viewMode, setViewMode] = useState('map');
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [modalClosing, setModalClosing] = useState(false);
  const [asnovaLength, setAsnovaLength] = useState('');
  const [asnovaEditMode, setAsnovaEditMode] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [machineLogs, setMachineLogs] = useState({});

  const handleCloseMachine = () => {
    setModalClosing(true);
    setTimeout(() => {
      setSelectedMachine(null);
      setModalClosing(false);
    }, 250);
  };

  const formatNumber = (num) => {
    if (!num && num !== 0) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const addLog = (machineId, msg, color) => {
    const time = new Date().toLocaleTimeString('uz-UZ');
    setMachineLogs(prev => ({
      ...prev,
      [machineId]: [...(prev[machineId] || []).slice(-50), { time, msg, color }]
    }));
  };

  useEffect(() => {
    fetchMachines();
    
    // Auto-refresh every 3 seconds
    const interval = setInterval(async () => {
      const token = localStorage.getItem('sr_token');
      try {
        const res = await fetch(`${API}/machines`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setMachines(data);
          data.forEach(m => {
            const prev = machineLogs[`${m.id}_lastStatus`];
            if (prev && prev !== m.status) {
              if (m.status === 'RUNNING') {
                addLog(m.id, `Ishlaydi - ${m.shift_meters?.toFixed(1)}m`, '#22c55e');
              } else if (m.status === 'ASNOVA_EMPTY') {
                addLog(m.id, 'Asnova tugadi!', '#b45309');
              } else if (m.status === 'NO_SIGNAL') {
                addLog(m.id, 'RS485 signal yo\'q', '#a855f7');
              } else if (m.status === 'OFFLINE') {
                addLog(m.id, 'ESP32 offline', '#64748b');
              } else if (m.status === 'DISCONNECTED') {
                addLog(m.id, 'Disconnected', '#64748b');
              }
            } else if (!prev && m.status !== 'NO_SIGNAL' && m.status !== 'DISCONNECTED') {
              if (m.status === 'RUNNING') {
                addLog(m.id, `Ishlaydi - ${m.shift_meters?.toFixed(1)}m`, '#22c55e');
              } else if (m.status === 'ASNOVA_EMPTY') {
                addLog(m.id, 'Asnova tugadi!', '#b45309');
              } else if (m.status === 'OFFLINE') {
                addLog(m.id, 'ESP32 offline', '#64748b');
              }
            }
            setMachineLogs(p => ({ ...p, [`${m.id}_lastStatus`]: m.status }));
          });
        }
      } catch (e) {}
    }, 3000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Real-time update for selected machine panel
  useEffect(() => {
    if (selectedMachine) {
      const updated = machines.find(m => m.id === selectedMachine.id);
      if (updated) {
        setSelectedMachine(updated);
      }
    }
  }, [machines]);

  const fetchMachines = async () => {
    const token = localStorage.getItem('sr_token');
    try {
      const res = await fetch(`${API}/machines`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMachines(await res.json());
    } catch (e) {}
  };

  const handleFillAsnova = async () => {
    if (!asnovaLength || isNaN(parseFloat(asnovaLength))) {
      alert('Iltimos, to\'g\'ri raqam kiriting!');
      return;
    }
    const token = localStorage.getItem('sr_token');
    try {
      await fetch(`${API}/machines/${selectedMachine.id}/fill`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_asnova_length: parseFloat(asnovaLength), last_operator_id: user?.id || 1 })
      });
      setAsnovaLength('');
      setAsnovaEditMode(false);
      fetchMachines();
    } catch (e) {}
  };

  const filteredMachines = machines.filter(m => {
    if (filter === 'running') return m.status === 'RUNNING';
    if (filter === 'stopped') return m.status === 'ASNOVA_EMPTY';
    if (filter === 'offline') return m.status === 'OFFLINE' || m.status === 'DISCONNECTED';
    if (filter === 'warning') return m.status === 'NO_SIGNAL' || m.status === 'ESP_ONLINE_NO_SIGNAL';
    return true;
  });

  const stats = {
    total: machines.length,
    running: machines.filter(m => m.status === 'RUNNING').length,
    stopped: machines.filter(m => m.status === 'ASNOVA_EMPTY').length,
    noSignal: machines.filter(m => m.status === 'NO_SIGNAL' || m.status === 'ESP_ONLINE_NO_SIGNAL').length,
    offline: machines.filter(m => m.status === 'OFFLINE' || m.status === 'DISCONNECTED').length,
  };

  return (
    <div className="dashboard">

      <div className="sr-stats">
        <div className="sr-stat"><Layers size={18}/><span className="sr-stat-value">{stats.total}</span><span className="sr-stat-label">Jami</span></div>
        <div className="sr-stat sr-running"><Play size={18}/><span className="sr-stat-value">{stats.running}</span><span className="sr-stat-label">Ishlaydi</span></div>
        <div className="sr-stat sr-stopped"><AlertTriangle size={18}/><span className="sr-stat-value">{stats.stopped}</span><span className="sr-stat-label">To'xtagan</span></div>
        <div className="sr-stat sr-no-signal"><Signal size={18}/><span className="sr-stat-value">{stats.noSignal}</span><span className="sr-stat-label">Signal yo'q</span></div>
        <div className="sr-stat sr-offline"><WifiOff size={18}/><span className="sr-stat-value">{stats.offline}</span><span className="sr-stat-label">Offline</span></div>
      </div>

      <div className="sr-controls">
        <div className="sr-filters">
          <button className={`sr-filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Barchasi</button>
          <button className={`sr-filter-btn ${filter === 'running' ? 'active' : ''}`} onClick={() => setFilter('running')}>Ishlaydi</button>
          <button className={`sr-filter-btn ${filter === 'stopped' ? 'active' : ''}`} onClick={() => setFilter('stopped')}>To'xtagan</button>
          <button className={`sr-filter-btn ${filter === 'warning' ? 'active' : ''}`} onClick={() => setFilter('warning')}>Signal yo'q</button>
          <button className={`sr-filter-btn ${filter === 'offline' ? 'active' : ''}`} onClick={() => setFilter('offline')}>Offline</button>
        </div>
        <div className="sr-view-toggle">
          <button className={`sr-view-btn ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')}><Map size={16}/></button>
          <button className={`sr-view-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><Grid size={16}/></button>
          <button className={`sr-view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={16}/></button>
        </div>
      </div>

      <div className={`sr-machines-section ${viewMode}-mode`}>
        {viewMode === 'map' ? (
          <InteractiveMap machines={machines} onSelectMachine={(m) => { setSelectedMachine(m); }} user={user} selectedMachine={selectedMachine} />
        ) : viewMode === 'grid' ? (
          <div className="sr-grid">
            {filteredMachines.map(m => (
              <div key={m.id} className="sr-machine-card" style={{ borderColor: getStatusColor(m.status) }} onClick={() => setSelectedMachine(m)}>
                <div className="sr-machine-header">
                  <div className="sr-machine-id">{m.id}</div>
                  {m.esp_wifi_rssi ? (
                    <div className="sr-wifi-signal">
                      <Wifi size={12} />
                      <span>{m.esp_wifi_rssi}</span>
                    </div>
                  ) : null}
                </div>
                <div className="sr-machine-status" style={{ color: getStatusColor(m.status) }}>{getStatusText(m.status)}</div>
                <div className="sr-machine-meters">
                  <AnimatedNumber value={m.shift_meters || 0} suffix="m" decimals={1} duration={500} />
                </div>
                <div className="sr-machine-connection">{m.connection_source || 'DISCONNECTED'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sr-list">
            {filteredMachines.map(m => (
              <div key={m.id} className="sr-list-item" style={{ borderLeftColor: getStatusColor(m.status) }} onClick={() => setSelectedMachine(m)}>
                <span className="sr-list-id">{m.id}</span>
                {m.esp_wifi_rssi ? (
                  <span className="sr-list-wifi"><Wifi size={12}/> {m.esp_wifi_rssi}</span>
                ) : null}
                <span className="sr-list-status" style={{ color: getStatusColor(m.status) }}>{getStatusText(m.status)}</span>
                <span className="sr-list-meters">
                  <AnimatedNumber value={m.shift_meters || 0} suffix="m" decimals={1} duration={500} /> / 
                  <AnimatedNumber value={m.remaining || 0} suffix="m" decimals={1} duration={500} />
                </span>
                <span className="sr-list-connection">{m.connection_source || '-'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedMachine && !showDiag && (
        <div className={`sr-modal ${modalClosing ? 'modal-exit' : ''}`}>
          <div className="sr-modal-content sr-modal-large">
            <button className="sr-close" onClick={handleCloseMachine}><X size={18}/></button>
            <h2>Stanok {selectedMachine.id}</h2>
            
            <div className="sr-modal-header">
              <div className="sr-modal-status" style={{ borderColor: getStatusColor(selectedMachine.status), backgroundColor: getStatusColor(selectedMachine.status) + '15' }}>
                <span style={{ color: getStatusColor(selectedMachine.status) }}>{getStatusText(selectedMachine.status)}</span>
              </div>
              <div className="sr-modal-switch">
                <button className={`sr-switch-btn ${showDiag ? '' : 'active'}`} onClick={() => setShowDiag(false)}>Asosiy</button>
                <button className={`sr-switch-btn ${showDiag ? 'active' : ''}`} onClick={() => setShowDiag(true)}>Diag</button>
              </div>
            </div>

            <div className="sr-metrics-grid">
              <div className="sr-metric-card">
                <span className="sr-metric-label">Jami ishlandi</span>
                <span className="sr-metric-value">{formatNumber(selectedMachine.meters?.toFixed(0) || 0)}m</span>
              </div>
              <div className="sr-metric-card">
                <span className="sr-metric-label">Asnova boshlang'ich</span>
                <div className="sr-metric-edit">
                  <span className="sr-metric-value">{formatNumber(selectedMachine.initial_asnova_length?.toFixed(0) || 0)}m</span>
                  {(user.role === 'ADMIN' || user.role === 'NAZORATCHI') && (
                    <button className="sr-edit-btn" onClick={() => setAsnovaEditMode(!asnovaEditMode)}>
                      ✏️
                    </button>
                  )}
                </div>
              </div>
              <div className="sr-metric-card highlight">
                <span className="sr-metric-label">Asnova qolgan</span>
                <span className="sr-metric-value warning">{formatNumber(selectedMachine.remaining?.toFixed(0) || 0)}m</span>
              </div>
              <div className="sr-metric-card">
                <span className="sr-metric-label">Baud tezligi</span>
                <span className="sr-metric-value">{selectedMachine.baud || 0}</span>
              </div>
            </div>

            {asnovaEditMode && (user.role === 'ADMIN' || user.role === 'NAZORATCHI') && (
              <div className="sr-input-section">
                <label>Yangi asnova uzunligi (metr):</label>
                <div className="sr-input-row">
                  <input 
                    type="text" 
                    placeholder="Raqam kiriting" 
                    value={asnovaLength}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d]/g, '');
                      setAsnovaLength(val);
                    }}
                    className="sr-number-input"
                  />
                  <button className="sr-save-btn" onClick={handleFillAsnova}>Saqlash</button>
                  <button className="sr-cancel-btn" onClick={() => { setAsnovaEditMode(false); setAsnovaLength(''); }}>Bekor</button>
                </div>
              </div>
            )}

            {(user.role === 'ADMIN' || user.role === 'NAZORATCHI') && selectedMachine.status !== 'ASNOVA_EMPTY' && !asnovaEditMode && (
              <div className="sr-fill-section">
                <button className="sr-fill-btn" onClick={() => setAsnovaEditMode(true)}>
                  📝 Asnova almashrish
                </button>
              </div>
            )}

            {(user.role === 'ADMIN' || user.role === 'NAZORATCHI') && selectedMachine.initial_asnova_length > 0 && (
              <div className="sr-fill-section" style={{ marginTop: '8px' }}>
                <button 
                  className="sr-fill-btn" 
                  style={{ background: '#ef4444', color: '#fff' }}
                  onClick={async () => {
                    if (!confirm('Asnova ma\'lumotlarini tozalashni tasdiqlaysizmi?')) return;
                    const token = localStorage.getItem('sr_token');
                    await fetch(`${API}/machines/${selectedMachine.id}/clear-asnova`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    fetchMachines();
                  }}
                >
                  🗑️ Tozalash
                </button>
              </div>
            )}

            <div className="sr-log-section">
              <h3>Real-time Log</h3>
              <div className="sr-log-window">
                {(machineLogs[selectedMachine?.id] || []).length === 0 ? (
                  <div className="sr-log-empty">Loglar hali yo'q...</div>
                ) : (
                  machineLogs[selectedMachine.id].map((log, idx) => (
                    <div key={idx} className="sr-log-entry" style={{ borderLeftColor: log.color || '#94a3b8' }}>
                      <span className="sr-log-time">{log.time}</span>
                      <span className="sr-log-msg">{log.msg}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedMachine && showDiag && (
        <div className={`sr-modal ${modalClosing ? 'modal-exit' : ''}`}>
          <div className="sr-modal-content sr-modal-large">
            <button className="sr-close" onClick={handleCloseMachine}><X size={18}/></button>
            <h2>Stanok {selectedMachine.id} - Diag</h2>
            
            <div className="sr-modal-header">
              <div className="sr-modal-status" style={{ borderColor: getStatusColor(selectedMachine.status), backgroundColor: getStatusColor(selectedMachine.status) + '15' }}>
                <span style={{ color: getStatusColor(selectedMachine.status) }}>{getStatusText(selectedMachine.status)}</span>
              </div>
              <div className="sr-modal-switch">
                <button className={`sr-switch-btn ${showDiag ? '' : 'active'}`} onClick={() => setShowDiag(false)}>Asosiy</button>
                <button className={`sr-switch-btn ${showDiag ? 'active' : ''}`} onClick={() => setShowDiag(true)}>Diag</button>
              </div>
            </div>

            <div className="sr-diag-grid">
              <div className="sr-diag-item">
                <span className="sr-diag-label">ESP32 status</span>
                <span className={`sr-diag-value ${selectedMachine.status === 'OFFLINE' ? 'offline' : 'online'}`}>
                  {selectedMachine.status === 'OFFLINE' ? '❌ Offline' : '✅ Online'}
                </span>
              </div>
              <div className="sr-diag-item">
                <span className="sr-diag-label">RS485 status</span>
                <span className={`sr-diag-value ${selectedMachine.status === 'RUNNING' ? 'online' : 'warning'}`}>
                  {selectedMachine.status === 'RUNNING' ? '✅ Signal bor' : '⚠️ Signal yo\'q'}
                </span>
              </div>
              <div className="sr-diag-item">
                <span className="sr-diag-label">USB/WiFi</span>
                <span className="sr-diag-value">
                  {selectedMachine.connection_source === 'WIFI' ? '📶 WiFi' : selectedMachine.connection_source === 'USB' ? '🔌 USB' : '❌ Disconnected'}
                </span>
              </div>
              <div className="sr-diag-item">
                <span className="sr-diag-label">Baud tezligi</span>
                <span className="sr-diag-value">{selectedMachine.baud || selectedMachine.current_baud || 0} bit/s</span>
              </div>
              <div className="sr-diag-item">
                <span className="sr-diag-label">Oxirgi signal</span>
                <span className="sr-diag-value">{selectedMachine.last_seen ? new Date(selectedMachine.last_seen).toLocaleTimeString() : '-'}</span>
              </div>
              <div className="sr-diag-item">
                <span className="sr-diag-label">Smena</span>
                <span className="sr-diag-value">{selectedMachine.shift_type || 'KUNDUZ'}</span>
              </div>
              {selectedMachine.connection_source === 'WIFI' && (
                <>
                  <div className="sr-diag-item">
                    <span className="sr-diag-label">IP manzil</span>
                    <span className="sr-diag-value">{selectedMachine.esp_ip || '-'}</span>
                  </div>
                  <div className="sr-diag-item">
                    <span className="sr-diag-label">WiFi SSID</span>
                    <span className="sr-diag-value">{selectedMachine.esp_wifi_ssid || '-'}</span>
                  </div>
                  <div className="sr-diag-item">
                    <span className="sr-diag-label">WiFi signal</span>
                    <span className="sr-diag-value">{selectedMachine.esp_wifi_rssi || 0} dBm</span>
                  </div>
                </>
              )}
              <div className="sr-diag-item">
                <span className="sr-diag-label">ESP RAM</span>
                <span className="sr-diag-value">{((selectedMachine.esp_free_ram || 0) / 1024).toFixed(1)} / {((selectedMachine.esp_total_ram || 0) / 1024).toFixed(1)} MB</span>
              </div>
              <div className="sr-diag-item">
                <span className="sr-diag-label">ESP ROM</span>
                <span className="sr-diag-value">{((selectedMachine.esp_free_rom || 0) / 1024).toFixed(1)} / {((selectedMachine.esp_total_rom || 0) / 1024).toFixed(1)} MB</span>
              </div>
              <div className="sr-diag-item">
                <span className="sr-diag-label">CPU chastotasi</span>
                <span className="sr-diag-value">{selectedMachine.esp_cpu_freq || 0} MHz</span>
              </div>
            </div>

            <div className="sr-log-section">
              <h3>ESP32 Log</h3>
              <div className="sr-log-window">
                {(machineLogs[selectedMachine?.id] || []).length === 0 ? (
                  <div className="sr-log-empty">ESP32 loglar yo'q...</div>
                ) : (
                  machineLogs[selectedMachine.id].map((log, idx) => (
                    <div key={idx} className="sr-log-entry" style={{ borderLeftColor: log.color || '#94a3b8' }}>
                      <span className="sr-log-time">{log.time}</span>
                      <span className="sr-log-msg">{log.msg}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
