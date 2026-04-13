import React, { useState, useEffect, useRef } from 'react';
import { FileText, Download, BarChart3, Calendar, Plus, X, Table2, Edit2, Eye } from 'lucide-react';
import ExcelTable from './ExcelTable';
import API from '../config';

const ReportsPanel = ({ user }) => {
  const token = localStorage.getItem('sr_token');

  const [machines, setMachines] = useState([]);
  const [tables, setTables] = useState(() => {
    const saved = localStorage.getItem('report_tables');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeTableId, setActiveTableId] = useState(null);
  const [showPdfNameModal, setShowPdfNameModal] = useState(null);
  const [savedExcels, setSavedExcels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        if (!token) return;
        const res = await fetch(`${API}/machines`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMachines(data);
        }
      } catch (e) {}
    };
    fetchMachines();
    const interval = setInterval(fetchMachines, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchSavedExcels();
  }, []);

  const fetchSavedExcels = async () => {
    try {
      const res = await fetch(`${API}/reports/saved-excel`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSavedExcels(data);
      }
    } catch (e) {}
  };

  const createNewTable = () => {
    const id = Date.now().toString();
    const newTable = {
      id,
      title: `Hisobot ${tables.length + 1}`,
      rows: 30,
      cols: 12,
      cells: {},
      mergedCells: {},
      colWidths: {},
      rowHeights: {},
      createdAt: new Date().toISOString()
    };
    const updated = [...tables, newTable];
    setTables(updated);
    localStorage.setItem('report_tables', JSON.stringify(updated));
    setActiveTableId(id);
  };

  const deleteTable = (id) => {
    const updated = tables.filter(t => t.id !== id);
    setTables(updated);
    localStorage.setItem('report_tables', JSON.stringify(updated));
    if (activeTableId === id) setActiveTableId(null);
  };

  const handleSaveTable = async (tableData) => {
    if (tableData.exportPDF) {
      setShowPdfNameModal({ tableId: activeTableId, defaultName: tableData.title || 'Hisobot' });
      return;
    }
    const updated = tables.map(t =>
      t.id === activeTableId ? { ...t, ...tableData } : t
    );
    setTables(updated);
    localStorage.setItem('report_tables', JSON.stringify(updated));

    const table = updated.find(t => t.id === activeTableId);
    if (table && table.savedPdfId) {
      try {
        await fetch(`${API}/reports/saved-excel/${table.savedPdfId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: tableData.title || table.title,
            filename: tableData.title || table.title,
            rows: tableData.rows || table.rows,
            cols: tableData.cols || table.cols,
            cells: tableData.cells || table.cells,
            mergedCells: tableData.mergedCells || table.mergedCells || {},
            colWidths: tableData.colWidths || table.colWidths || {},
            rowHeights: tableData.rowHeights || table.rowHeights || {},
          })
        });
        fetchSavedExcels();
      } catch (e) {}
    }
  };

  const saveAsPermanent = async (tableId) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    try {
      const res = await fetch(`${API}/reports/save-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: table.title,
          filename: table.title,
          rows: table.rows,
          cols: table.cols,
          cells: table.cells,
          mergedCells: table.mergedCells || {},
          colWidths: table.colWidths || {},
          rowHeights: table.rowHeights || {},
        })
      });
      if (res.ok) {
        const data = await res.json();
        const updated = tables.map(t =>
          t.id === tableId ? { ...t, savedPdfId: data.id } : t
        );
        setTables(updated);
        localStorage.setItem('report_tables', JSON.stringify(updated));
        fetchSavedExcels();
      }
    } catch (e) {}
  };

  const generatePDF = async (fileName) => {
    const table = tables.find(t => t.id === showPdfNameModal?.tableId);
    if (!table) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/reports/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: table.title,
          filename: fileName,
          rows: table.rows,
          cols: table.cols,
          cells: table.cells,
        })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        fetchSavedExcels();
      }
    } catch (e) {}
    setLoading(false);
    setShowPdfNameModal(null);
  };

  const exportExcel = async (tableId) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    try {
      const res = await fetch(`${API}/reports/saved-excel/download-temp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: table.title,
          filename: table.title,
          rows: table.rows,
          cols: table.cols,
          cells: table.cells,
        })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${table.title}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {}
  };

  const editSavedExcel = async (excel) => {
    try {
      const res = await fetch(`${API}/reports/saved-excel/${excel.id}/data`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const newTable = {
          id: Date.now().toString(),
          title: data.title,
          rows: data.rows,
          cols: data.cols,
          cells: data.cells || {},
          mergedCells: data.mergedCells || {},
          colWidths: data.colWidths || {},
          rowHeights: data.rowHeights || {},
          createdAt: new Date().toISOString(),
          savedPdfId: data.id,
        };
        const updated = [...tables, newTable];
        setTables(updated);
        localStorage.setItem('report_tables', JSON.stringify(updated));
        setActiveTableId(newTable.id);
      }
    } catch (e) {}
  };

  const deleteSavedExcel = async (excelId) => {
    if (!confirm('Hisobotni ochirmoqchimisiz?')) return;
    try {
      await fetch(`${API}/reports/saved-excel/${excelId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSavedExcels();
    } catch (e) {}
  };

  const downloadSavedExcel = async (excel) => {
    try {
      const res = await fetch(`${API}/reports/saved-excel/${excel.id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${excel.filename}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {}
  };

  const downloadMonthlyReport = async () => {
    try {
      const res = await fetch(`${API}/reports/monthly/excel?month=${reportMonth}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `operator_report_${reportMonth}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {}
  };

  const downloadAttendanceReport = async () => {
    try {
      const res = await fetch(`${API}/attendance/export?month=${reportMonth}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tabel_${reportMonth}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        console.error('Download failed:', res.status);
      }
    } catch (e) { console.error('Download error:', e); }
  };

  const reports = [
    {
      id: 'monthly',
      title: 'Oylik Operator Hisoboti',
      desc: 'Har operator bo\'yicha kunlik metr, reja va %',
      icon: <Calendar size={28} />,
      color: '#a855f7',
      action: downloadMonthlyReport,
    },
    {
      id: 'attendance',
      title: 'Davomat (Tabel) Hisoboti',
      desc: 'Ishga chiqqan/chiqmagan kunlar jadvali',
      icon: <BarChart3 size={28} />,
      color: '#22c55e',
      action: downloadAttendanceReport,
    },
  ];

  const activeTable = tables.find(t => t.id === activeTableId);

  return (
    <div className="panel-container">
      <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: 800, display: 'flex', alignItems: 'center' }}>
        <FileText size={24} style={{ marginRight: '8px' }} />
        Hisobotlar
      </h2>

      {/* Month Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>Oy:</label>
        <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
          className="input-field" style={{ width: '180px' }} />
      </div>

      {/* Standard Reports */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {reports.map(r => (
          <div key={r.id} style={{
            background: 'var(--card)',
            border: '1px solid var(--panel-border)',
            borderRadius: '16px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px',
                background: `${r.color}15`, color: r.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {r.icon}
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{r.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{r.desc}</div>
              </div>
            </div>
            <button
              onClick={r.action}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', background: `${r.color}15`, color: r.color,
                border: `1px solid ${r.color}33`, borderRadius: '10px',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
            >
              <Download size={16} /> Excel Yuklab Olish
            </button>
          </div>
        ))}
      </div>

      {/* Saqlangan Excel Hisobotlar */}
      {savedExcels.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} /> Saqlangan Hisobotlar
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {savedExcels.map(excel => (
              <div key={excel.id} style={{
                background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <FileText size={18} color="#a855f7" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {excel.title}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {excel.filename}.xlsx
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => downloadSavedExcel(excel)} style={savedBtnStyle} title="Yuklab olish">
                    <Download size={14} />
                  </button>
                  <button onClick={() => editSavedExcel(excel)} style={{ ...savedBtnStyle, color: '#00d2ff' }} title="Tahrirlash">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteSavedExcel(excel.id)} style={{ ...savedBtnStyle, color: '#ff3131' }} title="O'chirish">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Excel-like Tables Section */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Table2 size={20} /> Jadval Hisobotlari
          </h3>
          <button onClick={createNewTable} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: 'var(--primary)', color: '#0a0f1a', cursor: 'pointer',
            fontWeight: 800, fontSize: '0.8rem', transition: '0.2s'
          }}>
            <Plus size={16} /> Yangi Jadval
          </button>
        </div>

        {/* Table Tabs */}
        {tables.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {tables.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 12px', borderRadius: '10px',
                background: activeTableId === t.id ? 'rgba(0,210,255,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${activeTableId === t.id ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}`,
                cursor: 'pointer', transition: '0.2s'
              }}>
                <button onClick={() => setActiveTableId(t.id)} style={{
                  background: 'none', border: 'none', color: activeTableId === t.id ? 'var(--primary)' : '#f8fafc',
                  cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', padding: 0,
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <Table2 size={14} />
                  {t.title}
                  {t.savedPdfId && <span style={{ fontSize: '0.6rem', marginLeft: '4px', color: '#a855f7' }}>(Saqlangan)</span>}
                </button>
                {!t.savedPdfId && (
                  <button onClick={(e) => { e.stopPropagation(); saveAsPermanent(t.id); }} style={{
                    background: 'rgba(57,255,20,0.2)', border: 'none', borderRadius: '4px',
                    color: '#39ff14', cursor: 'pointer', padding: '2px 4px', display: 'flex',
                    lineHeight: 1, fontSize: '0.5rem'
                  }} title="Doimiy saqlash">💾</button>
                )}
                <button onClick={() => deleteTable(t.id)} style={{
                  background: 'rgba(255,49,49,0.2)', border: 'none', borderRadius: '4px',
                  color: '#ff3131', cursor: 'pointer', padding: '2px 4px', display: 'flex',
                  lineHeight: 1
                }}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Table Selection / Creation */}
        {activeTable ? (
          <div className="table-responsive" style={{ flex: 1, minHeight: '400px' }}>
            <ExcelTable
              key={activeTable.id}
              initialData={activeTable}
              onSave={handleSaveTable}
              machines={machines}
            />
          </div>
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '16px',
            flexDirection: 'column', gap: '12px', padding: '2rem'
          }}>
            <Table2 size={48} color="rgba(255,255,255,0.15)" />
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, textAlign: 'center' }}>
              Jadval yaratish tugmasini bosing
              <br />
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Excel uslubida jadval yarating</span>
            </div>
          </div>
        )}
      </div>

      {/* Loading Modal */}
      {loading && (
        <div className="modal-overlay">
          <div style={{ color: 'var(--primary)', fontSize: '1.2rem', fontWeight: 800 }}>
            PDF yaratilmoqda...
          </div>
        </div>
      )}

      {/* PDF Name Modal */}
      {showPdfNameModal && (
        <div className="modal-overlay" onClick={() => setShowPdfNameModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800 }}>
              Fayl Nomi
            </h3>
            <PdfNameForm
              defaultName={showPdfNameModal.defaultName}
              onConfirm={generatePDF}
              onCancel={() => setShowPdfNameModal(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const savedBtnStyle = {
  padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.15s'
};

const PdfNameForm = ({ defaultName, onConfirm, onCancel }) => {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div>
      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
        Fayl nomi
      </label>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onConfirm(name); }}
        className="input-field"
        placeholder="Fayl nomi"
      />
      <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer',
          fontWeight: 700, fontSize: '0.85rem'
        }}>Bekor qilish</button>
        <button onClick={() => onConfirm(name)} style={{
          flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
          background: 'var(--primary)', color: '#0a0f1a', cursor: 'pointer',
          fontWeight: 800, fontSize: '0.85rem'
        }}>Yaratish</button>
      </div>
    </div>
  );
};

export default ReportsPanel;
