import React, { useState, useEffect } from 'react';
import { Activity, FileText, Wrench, Shield, Users, Calendar, LogOut, Package, Server, AlertTriangle, Settings, X } from 'lucide-react';
import API from '../config';
import RestingBanner from './RestingBanner';

const Sidebar = ({ user, activeTab, onTabChange, onLogout, mobileMenuOpen, onMobileMenuClose, restDisplayNames = [] }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState({});

  const allTabs = [
    { id: 'dashboard', label: 'Stanok', icon: Activity },
    { id: 'mechanic', label: 'Mexanik', icon: Wrench },
    { id: 'uzlavyaz', label: 'Asnova', icon: AlertTriangle },
    { id: 'system', label: 'Tizim', icon: Server },
    { id: 'master', label: 'Operatorlar', icon: Wrench },
    { id: 'nazoratchi', label: 'Dam Kun Belgilash', icon: Calendar },
    { id: 'users', label: 'Foydalanuvchilar', icon: Users },
    { id: 'reports', label: 'Hisobotlar', icon: FileText },
    { id: 'admin', label: 'Sozlamalar', icon: Settings },
  ];

  // Admin gets all tabs, others get based on settings
  const userRole = user?.role || 'ADMIN';
  const filteredTabs = allTabs.filter(tab => {
    if (userRole === 'ADMIN') return true;
    const roleSections = settings?.role_sections?.[userRole] || [];
    return roleSections.includes(tab.id);
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('sr_token');
    if (!token) return;
    
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API}/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        }
      } catch (e) {}
    };
    
    fetchSettings();
  }, []);

  return (
    <div className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">{settings.logo_text || 'SR'}</div>
          <div className="sidebar-logo-text">
            <h2>{settings.company_name || 'FazoLuxe'}</h2>
            <p>SR Industrial</p>
          </div>
          {mobileMenuOpen && (
            <button className="sidebar-close-btn" onClick={onMobileMenuClose}>
              <X size={24} />
            </button>
          )}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-avatar">{(user?.full_name || 'U').charAt(0)}</div>
          <div>
            <div className="sidebar-user-name">{user?.full_name || 'Foydalanuvchi'}</div>
            <div className="sidebar-user-role">{user?.role || 'Guest'}</div>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Asosiy</div>
        {filteredTabs.map(tab => {
          const IconComponent = tab.icon;
          return (
            <button
              key={tab.id}
              className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <IconComponent size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <RestingBanner names={restDisplayNames} variant="sidebar" />
      <div className="sidebar-footer">
        <div className="sidebar-time">
          {currentTime.toLocaleTimeString('uz-UZ')}
        </div>
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={16} />
          <span>Chiqish</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
