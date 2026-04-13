import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { 
  Home, 
  Wrench, 
  AlertTriangle, 
  Server,
  Calendar,
  Users,
  FileText,
  LogOut,
  Settings
} from 'lucide-react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import AdminPanel from './components/AdminPanel';
import MasterPanel from './components/MasterPanel';
import NazoratchiPanel from './components/NazoratchiPanel';
import UsersPanel from './components/UsersPanel';
import ReportsPanel from './components/ReportsPanel';
import MechanicPanel from './components/MechanicPanel';
import AsnovaPanel from './components/AsnovaPanel';
import Sidebar from './components/Sidebar';
import SystemStatusPanel from './components/SystemStatusPanel';
import UzlavyazDashboard from './components/UzlavyazDashboard';
import RestingBanner from './components/RestingBanner';
import API from './config';

const SplashScreen = ({ onDone }) => {
  const [fadeOut, setFadeOut] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 2;
      });
    }, 50);

    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => onDone(), 600);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [onDone]);

  return (
    <div className={`splash-screen ${fadeOut ? 'splash-fade-out' : ''}`}>
      <div className="splash-content">
        <div className="splash-logo">
          <div className="splash-logo-ring"></div>
          <div className="splash-logo-inner">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
        </div>
        <h1 className="splash-title">FazoLuxe</h1>
        <p className="splash-subtitle">SR Industrial Dashboard</p>
        <div className="splash-progress">
          <div className="splash-progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="splash-loading">Yuklanmoqda...</p>
        <p className="splash-powerby">Power by SR</p>
      </div>
    </div>
  );
};

function App() {
  const readStoredUser = () => {
    try {
      const raw = localStorage.getItem('sr_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      localStorage.removeItem('sr_user');
      return null;
    }
  };

  const [user, setUser] = useState(readStoredUser);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showSplash, setShowSplash] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  const handleLogin = (userData) => {
    sessionStorage.removeItem('sr_notice');
    localStorage.setItem('sr_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = useCallback((notice) => {
    if (notice) {
      sessionStorage.setItem('sr_notice', notice);
    }
    localStorage.removeItem('sr_user');
    localStorage.removeItem('sr_token');
    setUser(null);
    setActiveTab('dashboard');
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('sr_token');
    const storedUser = readStoredUser();

    if (storedUser && !token) {
      handleLogout('Sessiya topilmadi. Qayta kiring.');
      setSessionChecked(true);
      return;
    }

    if (!token) {
      setSessionChecked(true);
      return;
    }

    const validateSession = async () => {
      try {
        const res = await fetch(`${API}/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const userData = await res.json();
          localStorage.setItem('sr_user', JSON.stringify(userData));
          setUser(userData);
        } else if (res.status === 401) {
          handleLogout('Sessiya tugadi. Qayta kiring.');
        }
      } catch (e) {}
      setSessionChecked(true);
    };

    validateSession();
  }, [handleLogout]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard user={user} />;
      case 'reports': return <ReportsPanel user={user} />;
      case 'mechanic': return <MechanicPanel user={user} />;
      case 'admin': return <AdminPanel user={user} />;
      case 'master': return <MasterPanel user={user} />;
      case 'nazoratchi': return <NazoratchiPanel user={user} />;
      case 'users': return <UsersPanel user={user} />;
      case 'asnova': return <AsnovaPanel user={user} />;
      case 'system': return <SystemStatusPanel user={user} />;
      case 'uzlavyaz': return <UzlavyazDashboard user={user} />;
      case 'schedule': return <ReportsPanel user={user} />;
      default: return <Dashboard user={user} />;
    }
  };

  const [banner, setBanner] = useState(null);
  const [showBanner, setShowBanner] = useState(true);
  const [settings, setSettings] = useState({});
  const [restingToday, setRestingToday] = useState([]);
  const restDisplayNames = restingToday
    .map(person => person.operator_name || person.user_name || '')
    .filter(Boolean);
  
  useEffect(() => {
    const token = localStorage.getItem('sr_token');
    if (!token) return;
    
    const fetchResting = async () => {
      try {
        const res = await fetch(`${API}/rest-days/today`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setRestingToday(data);
        }
      } catch (e) {}
    };
    
    fetchResting();
    const interval = setInterval(fetchResting, 5000);
    return () => clearInterval(interval);
  }, []);
  
  useEffect(() => {
    const token = localStorage.getItem('sr_token');
    if (!token || !user) return;
    
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API}/settings`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          if (data.banner_enabled && data.banner_message) {
            setBanner(data);
          }
        }
      } catch (e) {}
    };
    
    fetchSettings();
  }, [user]);

  useEffect(() => {
    if (banner?.banner_duration) {
      const timer = setTimeout(() => setShowBanner(false), banner.banner_duration * 1000);
      return () => clearTimeout(timer);
    }
  }, [banner]);

  if (showSplash || !sessionChecked) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  const allTabs = [
    { id: 'dashboard', label: 'Stanok', icon: Home },
    { id: 'mechanic', label: 'Mexanik', icon: Wrench },
    { id: 'uzlavyaz', label: 'Asnova', icon: AlertTriangle },
    { id: 'system', label: 'Tizim', icon: Server },
    { id: 'master', label: 'Operatorlar', icon: Wrench },
    { id: 'nazoratchi', label: 'Dam Kun Belgilash', icon: Calendar },
    { id: 'users', label: 'Foydalanuvchilar', icon: Users },
    { id: 'reports', label: 'Hisobotlar', icon: FileText },
    { id: 'admin', label: 'Sozlamalar', icon: Settings },
  ];

  const userRole = user?.role || 'ADMIN';
  const mobileTabs = allTabs.filter(tab => {
    if (userRole === 'ADMIN') return true;
    const roleSections = settings?.role_sections?.[userRole] || [];
    return roleSections.includes(tab.id);
  });

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/" />} />
        <Route path="/*" element={
          user ? (
            <div className={`app-container ${mobileMenuOpen ? 'mobile-drawer-open' : ''}`}>
              {banner && showBanner && (
                <div className="app-banner">
                  <span>{banner.banner_message}</span>
                  <button onClick={() => setShowBanner(false)}>×</button>
                </div>
              )}
              
              {/* Rest banner - mobile uchun faqat mobile menyuda korinsin (sidebar ichida bor u), shuning uchun bu yerdagisini olib tashlaymiz */}
              
              <Sidebar 
                user={user} 
                activeTab={activeTab} 
                onTabChange={(tab) => { setActiveTab(tab); setMobileMenuOpen(false); }} 
                onLogout={handleLogout}
                mobileMenuOpen={mobileMenuOpen}
                onMobileMenuClose={() => setMobileMenuOpen(false)}
                restDisplayNames={restDisplayNames}
              />

              <div className="main-content">
                <RestingBanner names={restDisplayNames} variant="mobile" />
                {renderContent()}
              </div>

              <div className="mobile-bottom-nav">
                {mobileTabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button 
                      key={tab.id} 
                      className={`mobile-bottom-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <Icon size={24} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
                <button 
                  className="mobile-bottom-nav-item"
                  onClick={handleLogout}
                  style={{ color: '#ef4444' }}
                >
                  <LogOut size={24} />
                  <span>Chiqish</span>
                </button>
              </div>

              <div 
                className={`mobile-overlay ${mobileMenuOpen ? 'show' : ''}`} 
                onClick={() => setMobileMenuOpen(false)} 
              />
            </div>
          ) : (
            <Navigate to="/login" />
          )
        } />
      </Routes>
    </Router>
  );
}

export default App;
