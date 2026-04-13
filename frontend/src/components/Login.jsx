import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import API from '../config';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const savedUsername = localStorage.getItem('sr_username');
    const notice = sessionStorage.getItem('sr_notice');

    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }

    if (notice) {
      setError(notice);
      sessionStorage.removeItem('sr_notice');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API}/token`,
        new URLSearchParams({ username, password }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const token = response.data.access_token;
      localStorage.setItem('sr_token', token);
      
      if (rememberMe) {
        localStorage.setItem('sr_username', username);
      } else {
        localStorage.removeItem('sr_username');
      }
      
      const userResponse = await axios.get(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onLogin(userResponse.data);
    } catch (err) {
      const message = err?.response?.status === 401
        ? 'Login yoki parol xato'
        : 'Server bilan ulanishda xatolik';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form onSubmit={handleSubmit} className="login-card">
        <div className="login-header">
          <div className="login-icon">
            <LogIn size={36} color="#38bdf8" />
          </div>
          <h2 className="login-title">SMART ESP32</h2>
          <p className="login-subtitle">Industrial Monitoring Portal</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="login-field">
          <label>Foydalanuvchi</label>
          <input 
            type="text" 
            placeholder="Login kiriting"
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            required 
            autoFocus
          />
        </div>

        <div className="login-field" style={{ position: 'relative' }}>
          <label>Parol</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder="Parol kiriting"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              style={{ paddingRight: '40px', width: '100%' }}
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="login-remember">
          <label>
            <input 
              type="checkbox" 
              checked={rememberMe} 
              onChange={(e) => setRememberMe(e.target.checked)} 
            />
            <span>Eslab qol</span>
          </label>
        </div>

        <button type="submit" className="btn-submit login-btn" disabled={loading}>
          {loading ? 'Kutilmoqda...' : 'Kirish'}
        </button>
      </form>
    </div>
  );
};

export default Login;
