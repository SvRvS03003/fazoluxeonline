import React, { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { emitRefresh } from '../utils/events';
import API from '../config';

const DAYS = ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'];
const DAYS_FULL = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}

const NazoratchiPanel = ({ user }) => {
  const [operators, setOperators] = useState([]);
  const [users, setUsers] = useState([]);
  const [restDays, setRestDays] = useState([]);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));

  const token = localStorage.getItem('sr_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };


  const fetchData = async () => {
    try {
      const [opsRes, usersRes, restRes] = await Promise.all([
        fetch(`${API}/operators`, { headers }),
        fetch(`${API}/users`, { headers }),
        fetch(`${API}/rest-days?week_start=${weekStart}`, { headers }),
      ]);
      if (opsRes.ok) setOperators(await opsRes.json());
      if (usersRes.ok) {
        const allUsers = await usersRes.json();
        const activeUsers = allUsers.filter(u => u.is_active === 1 && (u.shift_type === 'KUNDUZ' || u.shift_type === 'TUNGI'));
        setUsers(activeUsers);
      }
      if (restRes.ok) setRestDays(await restRes.json());
    } catch (e) {
      console.error('FETCH_ERROR:', e);
    }
  };

  const getAllPeople = () => {
    const ops = operators.filter(o => o.is_active === 1).map(o => ({
      id: o.id,
      name: o.name,
      shift_type: o.shift_type,
      type: 'operator'
    }));
    const us = users.filter(u => u.is_active === 1).map(u => ({
      id: u.id,
      name: u.full_name,
      shift_type: u.shift_type,
      type: 'user'
    }));
    const all = [...ops, ...us].sort((a, b) => a.name.localeCompare(b.name));
    return all;
  };

  useEffect(() => { fetchData(); }, [weekStart]);
  useEffect(() => {
    const h = () => fetchData();
    window.addEventListener('app-refresh', h);
    return () => window.removeEventListener('app-refresh', h);
  }, [weekStart]);

  const toggleRestDay = async (personId, dayOfWeek, personType) => {
    try {
      // Check if already resting today - if so, DELETE instead of POST
      const isCurrentlyResting = isResting(personId, personType, dayOfWeek);
      
      if (isCurrentlyResting) {
        // DELETE rest day
        const res = await fetch(`${API}/rest-days`, {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ 
            operator_id: personType === 'operator' ? personId : null,
            user_id: personType === 'user' ? personId : null,
            day_of_week: dayOfWeek,
            week_start: weekStart
          })
        });
        if (res.ok) {
          fetchData();
          emitRefresh();
        }
        return;
      }
      
      // POST to add rest day
      const res = await fetch(`${API}/rest-days`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          operator_id: personType === 'operator' ? personId : null,
          user_id: personType === 'user' ? personId : null,
          day_of_week: dayOfWeek,
          week_start: weekStart
        })
      });
      
      const data = await res.json();
      console.log('REST_DAYS_RESP:', data);
      
      if (!res.ok) {
        alert('Xatolik: ' + data.error);
      }
      
      fetchData();
      emitRefresh();
    } catch (e) {
      console.error('TOGGLE_ERROR:', e);
    }
  };

  const isResting = (personId, personType, dow) => {
    return restDays.some(r => {
      const rOpId = personType === 'operator' ? r.operator_id : r.user_id;
      return rOpId === personId && r.day_of_week === dow;
    });
  };

  const shiftWeek = (offset) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const weekLabel = () => {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('uz')} - ${end.toLocaleDateString('uz')}`;
  };

  const getBadgeLabel = (person) => person.type === 'operator' ? 'OP' : 'ADM';

  const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' };
  const tdStyle = { padding: '12px 16px', fontSize: '0.85rem', fontWeight: 500 };
  const navBtnStyle = { padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center' };

  const allPeople = getAllPeople();

  return (
    <div className="panel-container">
      <div className="rest-schedule-header">
        <h2 className="rest-schedule-title">
          <Calendar size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          Dam Olish Jadvali
        </h2>
        <div className="rest-schedule-week-nav">
          <button onClick={() => shiftWeek(-1)} style={navBtnStyle}><ChevronLeft size={16} /></button>
          <span className="rest-schedule-week-label">
            {weekLabel()}
          </span>
          <button onClick={() => shiftWeek(1)} style={navBtnStyle}><ChevronRight size={16} /></button>
        </div>
      </div>

      {['KUNDUZ', 'TUNGI'].map(shift => {
        const shiftPeople = allPeople.filter(p => p.shift_type === shift);
        const shiftColor = shift === 'KUNDUZ' ? '#f59e0b' : '#6366f1';
        const shiftLabel = shift === 'KUNDUZ' ? '☀️ Kunduzgi Smena' : '🌙 Tungi Smena';

        return (
          <div key={shift} className="rest-shift-section" style={{ '--shift-color': shiftColor }}>
            <h3 className="rest-shift-heading" style={{ color: shiftColor }}>
              {shiftLabel}
              <span className="rest-shift-count" style={{ background: `${shiftColor}22`, color: shiftColor }}>{shiftPeople.length} ta</span>
            </h3>

            {shiftPeople.length === 0 ? (
              <div style={{
                padding: '2rem', textAlign: 'center', color: 'var(--text-muted)',
                background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--panel-border)'
              }}>
                Ishchilar yo'q
              </div>
            ) : (
              <>
                <div className="table-responsive rest-schedule-table">
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
                        <th style={thStyle}>Ism</th>
                        {DAYS.map((d, i) => (
                          <th key={i} style={{ ...thStyle, textAlign: 'center' }}>{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftPeople.map(person => (
                        <tr key={`${person.type}-${person.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '32px', height: '32px', borderRadius: '8px',
                                background: person.type === 'operator' ? `${shiftColor}22` : '#3b82f622',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.8rem', fontWeight: 800, color: person.type === 'operator' ? shiftColor : '#3b82f6'
                              }}>
                                {person.name.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 600 }}>{person.name}</span>
                              <span style={{
                                fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px',
                                background: person.type === 'operator' ? `${shiftColor}15` : '#3b82f615',
                                color: person.type === 'operator' ? shiftColor : '#3b82f6'
                              }}>
                                {getBadgeLabel(person)}
                              </span>
                            </div>
                          </td>
                          {DAYS.map((_, dow) => {
                            const resting = isResting(person.id, person.type, dow);
                            return (
                              <td key={dow} style={{ ...tdStyle, textAlign: 'center' }}>
                                <button
                                  onClick={() => toggleRestDay(person.id, dow, person.type)}
                                  style={{
                                    width: '36px', height: '36px', borderRadius: '8px',
                                    border: resting ? '2px solid #fbbf24' : '1px solid var(--panel-border)',
                                    background: resting ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.03)',
                                    color: resting ? '#fbbf24' : 'var(--text-muted)',
                                    cursor: 'pointer', fontSize: '1rem', fontWeight: 700,
                                    transition: 'all 0.2s'
                                  }}
                                  title={DAYS_FULL[dow]}
                                >
                                  {resting ? '🛏️' : '○'}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rest-schedule-mobile-list">
                  {shiftPeople.map(person => (
                    <article key={`mobile-${person.type}-${person.id}`} className="rest-person-card">
                      <div className="rest-person-card-head">
                        <div className="rest-person-main">
                          <div
                            className="rest-person-avatar"
                            style={{
                              background: person.type === 'operator' ? `${shiftColor}22` : '#3b82f622',
                              color: person.type === 'operator' ? shiftColor : '#3b82f6'
                            }}
                          >
                            {person.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="rest-person-meta">
                            <div className="rest-person-name">{person.name}</div>
                            <div className="rest-person-subline">
                              <span
                                className="rest-person-badge"
                                style={{
                                  background: person.type === 'operator' ? `${shiftColor}15` : '#3b82f615',
                                  color: person.type === 'operator' ? shiftColor : '#3b82f6'
                                }}
                              >
                                {getBadgeLabel(person)}
                              </span>
                              <span className="rest-person-shift">{shift === 'KUNDUZ' ? 'Kunduzgi' : 'Tungi'} smena</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rest-person-days">
                        {DAYS.map((dayLabel, dow) => {
                          const resting = isResting(person.id, person.type, dow);
                          return (
                            <button
                              key={dow}
                              className={`rest-day-card ${resting ? 'active' : ''}`}
                              onClick={() => toggleRestDay(person.id, dow, person.type)}
                              title={DAYS_FULL[dow]}
                            >
                              <span className="rest-day-name">{dayLabel}</span>
                              <span className="rest-day-state">{resting ? 'Dam' : 'Ish'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default NazoratchiPanel;
