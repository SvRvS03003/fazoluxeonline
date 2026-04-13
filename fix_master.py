import re

with open('frontend/src/components/MasterPanel.jsx', 'r') as f:
    content = f.read()

# Add shift_type to Operator schema
with open('backend/app/models.py', 'r') as f:
    models_content = f.read()

if 'shift_type = Column' not in models_content:
    models_content = models_content.replace(
        '    is_active = Column(Integer, default=1)\n    created_at = Column(DateTime, default=datetime.datetime.utcnow)',
        '    is_active = Column(Integer, default=1)\n    shift_type = Column(String, default="KUNDUZ")\n    created_at = Column(DateTime, default=datetime.datetime.utcnow)'
    )
    with open('backend/app/models.py', 'w') as f:
        f.write(models_content)
    print('Models updated with shift_type')

with open('backend/app/schemas.py', 'r') as f:
    schemas_content = f.read()

if 'shift_type' not in 'class OperatorBase' in schemas_content:
    schemas_content = schemas_content.replace(
        'class OperatorBase(BaseModel):\n    name: str\n    phone: str = ""',
        'class OperatorBase(BaseModel):\n    name: str\n    phone: str = ""\n    shift_type: str = "KUNDUZ"'
    )
    schemas_content = schemas_content.replace(
        'class OperatorUpdate(BaseModel):\n    name: Optional[str] = None\n    phone: Optional[str] = None\n    is_active: Optional[int] = None',
        'class OperatorUpdate(BaseModel):\n    name: Optional[str] = None\n    phone: Optional[str] = None\n    is_active: Optional[int] = None\n    shift_type: Optional[str] = None'
    )
    schemas_content = schemas_content.replace(
        'class OperatorOut(OperatorBase):\n    id: int\n    is_active: int\n    created_at: datetime',
        'class OperatorOut(OperatorBase):\n    id: int\n    is_active: int\n    shift_type: str = "KUNDUZ"\n    created_at: datetime'
    )
    with open('backend/app/schemas.py', 'w') as f:
        f.write(schemas_content)
    print('Schemas updated with shift_type')

with open('backend/app/main.py', 'r') as f:
    main_content = f.read()

main_content = main_content.replace(
    '    op = models.Operator(name=data.name, phone=data.phone)',
    '    op = models.Operator(name=data.name, phone=data.phone, shift_type=data.shift_type)'
)
main_content = main_content.replace(
    '    if data.is_active is not None:\n        op.is_active = data.is_active\n    db.commit()\n    db.refresh(op)\n    return op\n\n@app.delete("/operators/{op_id}")',
    '    if data.is_active is not None:\n        op.is_active = data.is_active\n    if data.shift_type is not None:\n        op.shift_type = data.shift_type\n    db.commit()\n    db.refresh(op)\n    return op\n\n@app.delete("/operators/{op_id}")'
)
with open('backend/app/main.py', 'w') as f:
    f.write(main_content)
print('Main.py updated')

# Now update MasterPanel to show shift toggle and edit capability
old_section = '''  const handleAddOperator = async () => {
    if (!opForm.name) return;
    try {
      const res = await fetch(`${API}/operators`, {
        method: 'POST', headers, body: JSON.stringify(opForm)
      });
      if (res.ok) {
        setOpForm({ name: '', phone: '' });
        setShowAddOp(false);
        fetchData();
        emitRefresh();
      } else {
        const data = await res.json();
        alert(data.detail || 'Xatolik yuz berdi');
      }
    } catch (e) { alert('Server xatoligi'); }
  };'''

new_section = '''  const handleAddOperator = async () => {
    if (!opForm.name) return;
    try {
      const res = await fetch(`${API}/operators`, {
        method: 'POST', headers, body: JSON.stringify({ ...opForm, shift_type: opShift })
      });
      if (res.ok) {
        setOpForm({ name: '', phone: '' });
        setShowAddOp(false);
        fetchData();
        emitRefresh();
      } else {
        const data = await res.json();
        alert(data.detail || 'Xatolik yuz berdi');
      }
    } catch (e) { alert('Server xatoligi'); }
  };

  const handleShiftChange = async (opId, newShift) => {
    try {
      await fetch(`${API}/operators/${opId}`, {
        method: 'PUT', headers, body: JSON.stringify({ shift_type: newShift })
      });
      fetchData();
      emitRefresh();
    } catch (e) {}
  };'''

content = content.replace(old_section, new_section)

# Update operator table to show shift toggle
old_table = '''                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.8rem', fontWeight: 800, color: '#f59e0b'
                        }}>{op.name.charAt(0).toUpperCase()}</div>
                        <span style={{ fontWeight: 600 }}>{op.name}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{op.phone || '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {opAsgs.map(a => (
                          <span key={a.id} style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700,
                            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}>
                            {a.machine_id}
                            <button onClick={() => handleUnassign(a.id)} style={{
                              background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: '0.6rem'
                            }}>x</button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {resting ? (
                        <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>Dam olish</span>
                      ) : (
                        <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(57,255,20,0.15)', color: '#39ff14' }}>Ishlayapti</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => handleDeleteOperator(op.id)} style={actionBtnStyle('#ef4444')}>
                        <Trash2 size={14} />
                      </button>
                    </td>'''

new_table = '''                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.8rem', fontWeight: 800, color: '#f59e0b'
                        }}>{op.name.charAt(0).toUpperCase()}</div>
                        <span style={{ fontWeight: 600 }}>{op.name}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{op.phone || '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {opAsgs.map(a => (
                          <span key={a.id} style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700,
                            background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}>
                            {a.machine_id}
                            <button onClick={() => handleUnassign(a.id)} style={{
                              background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: '0.6rem'
                            }}>x</button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button onClick={() => handleShiftChange(op.id, 'KUNDUZ')} style={{
                          padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          fontWeight: 700, fontSize: '0.65rem',
                          background: op.shift_type === 'KUNDUZ' ? '#f59e0b' : 'rgba(255,255,255,0.05)',
                          color: op.shift_type === 'KUNDUZ' ? '#000' : 'var(--text-muted)'
                        }}>K</button>
                        <button onClick={() => handleShiftChange(op.id, 'TUNGI')} style={{
                          padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          fontWeight: 700, fontSize: '0.65rem',
                          background: op.shift_type === 'TUNGI' ? '#6366f1' : 'rgba(255,255,255,0.05)',
                          color: op.shift_type === 'TUNGI' ? '#fff' : 'var(--text-muted)'
                        }}>T</button>
                        {resting ? (
                          <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>Dam</span>
                        ) : (
                          <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(57,255,20,0.15)', color: '#39ff14' }}>OK</span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => handleDeleteOperator(op.id)} style={actionBtnStyle('#ef4444')}>
                        <Trash2 size={14} />
                      </button>
                    </td>'''

content = content.replace(old_table, new_table)

with open('frontend/src/components/MasterPanel.jsx', 'w') as f:
    f.write(content)
print('MasterPanel fully updated!')