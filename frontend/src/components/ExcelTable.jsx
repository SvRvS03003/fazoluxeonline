import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Palette, Link2, Trash2, Type, Plus, Minus, Save, FileDown, Grid3X3, AlignLeft, AlignCenter, AlignRight, Expand, Shrink, Copy, Clipboard, ArrowDown, ArrowRight, Rows3, Columns3, Merge } from 'lucide-react';

const COLORS = [
  '#ff3131', '#ff6b35', '#ffea00', '#39ff14', '#00d2ff', '#a855f7', '#ec4899',
  '#ffffff', '#94a3b8', '#1e293b', '#000000', '#7c3aed', '#06b6d4', '#84cc16',
];

const CELL_COLORS = [
  { label: 'Qizil', value: 'rgba(255,49,49,0.25)' },
  { label: 'Yashil', value: 'rgba(57,255,20,0.2)' },
  { label: "Ko'k", value: 'rgba(0,210,255,0.2)' },
  { label: 'Sariq', value: 'rgba(255,234,0,0.2)' },
  { label: 'Binafsha', value: 'rgba(168,85,247,0.2)' },
  { label: 'Pushti', value: 'rgba(236,72,153,0.2)' },
  { label: 'Tozalash', value: 'transparent' },
];

const FONTS = ['Inter', 'Arial', 'Georgia', 'Courier New', 'Times New Roman'];
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32];

const DEFAULT_ROWS = 30;
const DEFAULT_COLS = 12;
const COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function colLabel(c) {
  if (c < 26) return COL_LABELS[c];
  return COL_LABELS[Math.floor(c / 26) - 1] + COL_LABELS[c % 26];
}

function cellKey(r, c) {
  return `${r}-${c}`;
}

const ExcelTable = ({ initialData, onSave, machines = [] }) => {
  const [rows, setRows] = useState(initialData?.rows || DEFAULT_ROWS);
  const [cols, setCols] = useState(initialData?.cols || DEFAULT_COLS);
  const [cells, setCells] = useState(initialData?.cells || {});
  const [mergedCells, setMergedCells] = useState(initialData?.mergedCells || {});
  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [activePanel, setActivePanel] = useState(null);
  const [title, setTitle] = useState(initialData?.title || 'Yangi Hisobot');
  const [colWidths, setColWidths] = useState(() => {
    const saved = initialData?.colWidths;
    return saved || {};
  });
  const [rowHeights, setRowHeights] = useState(() => {
    const saved = initialData?.rowHeights;
    return saved || {};
  });
  const [autoResize, setAutoResize] = useState(false);
  const [resizing, setResizing] = useState(null);
  const [resizeStart, setResizeStart] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const tableRef = useRef(null);
  const editRef = useRef(null);
  const measureRef = useRef(null);

  const getCell = useCallback((r, c) => {
    return cells[cellKey(r, c)] || { value: '', style: {} };
  }, [cells]);

  const updateCell = useCallback((r, c, updates) => {
    setCells(prev => {
      const key = cellKey(r, c);
      const existing = prev[key] || { value: '', style: {} };
      return { ...prev, [key]: { ...existing, ...updates } };
    });
  }, []);

  // Measure text width using canvas
  const measureText = useCallback((text, fontSize = 13, fontFamily = 'Inter', fontWeight = 400) => {
    if (!measureRef.current) {
      measureRef.current = document.createElement('canvas').getContext('2d');
    }
    const ctx = measureRef.current;
    ctx.font = `${fontWeight === 700 ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
    return ctx.measureText(text).width;
  }, []);

  // Auto-resize column based on content
  const autoResizeColumn = useCallback((colIdx) => {
    let maxWidth = 40;
    for (let r = 0; r < rows; r++) {
      const cell = getCell(r, colIdx);
      const val = String(cell.value || '');
      if (!val) continue;
      const fontSize = cell.style?.fontSize || 13;
      const fontWeight = cell.style?.fontWeight || 400;
      const fontFamily = cell.style?.fontFamily || 'Inter';
      const lines = val.split('\n');
      for (const line of lines) {
        const w = measureText(line, fontSize, fontFamily, fontWeight);
        maxWidth = Math.max(maxWidth, w + 16);
      }
    }
    setColWidths(prev => ({ ...prev, [colIdx]: Math.ceil(maxWidth) }));
  }, [rows, getCell, measureText]);

  // Auto-resize row based on content
  const autoResizeRow = useCallback((rowIdx) => {
    let maxHeight = 36;
    for (let c = 0; c < cols; c++) {
      const cell = getCell(rowIdx, c);
      const val = String(cell.value || '');
      if (!val) continue;
      const fontSize = cell.style?.fontSize || 13;
      const lines = val.split('\n');
      const cellWidth = colWidths[c] || 80;
      let totalLines = 0;
      for (const line of lines) {
        const w = measureText(line, fontSize, cell.style?.fontFamily || 'Inter', cell.style?.fontWeight || 400);
        totalLines += Math.max(1, Math.ceil(w / (cellWidth - 12)));
      }
      const h = totalLines * (fontSize + 4) + 16;
      maxHeight = Math.max(maxHeight, h);
    }
    setRowHeights(prev => ({ ...prev, [rowIdx]: Math.ceil(maxHeight) }));
  }, [cols, getCell, colWidths, measureText]);

  // Auto-resize all
  const autoResizeAll = useCallback(() => {
    for (let c = 0; c < cols; c++) autoResizeColumn(c);
    for (let r = 0; r < rows; r++) autoResizeRow(r);
  }, [cols, rows, autoResizeColumn, autoResizeRow]);

  // When auto-resize is on and cells change, resize all
  useEffect(() => {
    if (autoResize) {
      autoResizeAll();
    }
  }, [cells, autoResize, autoResizeAll]);

  const getSelectedCells = useCallback(() => {
    if (selectedRange) {
      const res = [];
      const r1 = Math.min(selectedRange.r1, selectedRange.r2);
      const r2 = Math.max(selectedRange.r1, selectedRange.r2);
      const c1 = Math.min(selectedRange.c1, selectedRange.c2);
      const c2 = Math.max(selectedRange.c1, selectedRange.c2);
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          res.push({ r, c });
        }
      }
      return res;
    }
    if (selectedCell) return [selectedCell];
    return [];
  }, [selectedCell, selectedRange]);

  const handleCellClick = (r, c, e) => {
    if (e.shiftKey && selectedCell) {
      setSelectedRange({
        r1: selectedCell.r, c1: selectedCell.c,
        r2: r, c2: c
      });
      setSelectedCell(null);
    } else {
      setSelectedCell({ r, c });
      setSelectedRange(null);
    }
    setContextMenu(null);
    setActivePanel(null);
  };

  const handleCellMouseDown = (r, c, e) => {
    if (e.button === 0 && !e.shiftKey) {
      setSelecting(true);
      setSelectionStart({ r, c });
    }
  };

  const handleCellMouseEnter = (r, c) => {
    if (selecting && selectionStart) {
      setSelectedCell(null);
      setSelectedRange({
        r1: selectionStart.r, c1: selectionStart.c,
        r2: r, c2: c
      });
    }
  };

  const handleMouseUp = () => {
    setSelecting(false);
    setSelectionStart(null);
    if (resizing) {
      setResizing(null);
      setResizeStart(null);
    }
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleCellDoubleClick = (r, c) => {
    const cell = getCell(r, c);
    setEditValue(cell.value || '');
    setEditMode(true);
    setTimeout(() => editRef.current?.focus(), 10);
  };

  const handleEditFinish = () => {
    if (selectedCell) {
      updateCell(selectedCell.r, selectedCell.c, { value: editValue });
    }
    setEditMode(false);
  };

  const handleContextMenu = (r, c, e) => {
    e.preventDefault();
    // If right-clicked cell is not in current selection, select it
    const isInSelection = selectedRange &&
      r >= Math.min(selectedRange.r1, selectedRange.r2) &&
      r <= Math.max(selectedRange.r1, selectedRange.r2) &&
      c >= Math.min(selectedRange.c1, selectedRange.c2) &&
      c <= Math.max(selectedRange.c1, selectedRange.c2);
    
    if (!isInSelection && !(selectedCell && selectedCell.r === r && selectedCell.c === c)) {
      setSelectedCell({ r, c });
      setSelectedRange(null);
    }
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 400),
    });
  };

  const handleKeyDown = (e) => {
    if (!selectedCell) return;
    if (editMode) {
      if (e.key === 'Enter' && !e.shiftKey) { handleEditFinish(); e.preventDefault(); }
      if (e.key === 'Escape') { setEditMode(false); e.preventDefault(); }
      return;
    }
    // Ctrl+C copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      copyCells();
      e.preventDefault();
      return;
    }
    // Ctrl+V paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      pasteCells();
      e.preventDefault();
      return;
    }
    let { r, c } = selectedCell;
    if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'ArrowDown') r = Math.min(rows - 1, r + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') c = Math.min(cols - 1, c + 1);
    else if (e.key === 'Enter') { handleCellDoubleClick(r, c); return; }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      getSelectedCells().forEach(({ r, c }) => updateCell(r, c, { value: '' }));
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setEditValue(e.key);
      setEditMode(true);
      setTimeout(() => editRef.current?.focus(), 10);
      return;
    } else return;
    e.preventDefault();
    setSelectedCell({ r, c });
    setSelectedRange(null);
  };

  // Column resize
  const handleColResizeStart = (colIdx, e) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({ type: 'col', index: colIdx });
    setResizeStart({ x: e.clientX, y: e.clientY, origSize: colWidths[colIdx] || 80 });
  };

  // Row resize
  const handleRowResizeStart = (rowIdx, e) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({ type: 'row', index: rowIdx });
    setResizeStart({ x: e.clientX, y: e.clientY, origSize: rowHeights[rowIdx] || 36 });
  };

  useEffect(() => {
    if (!resizing || !resizeStart) return;
    const handleMouseMove = (e) => {
      if (resizing.type === 'col') {
        const delta = e.clientX - resizeStart.x;
        const newWidth = Math.max(30, resizeStart.origSize + delta);
        setColWidths(prev => ({ ...prev, [resizing.index]: newWidth }));
      } else {
        const delta = e.clientY - resizeStart.y;
        const newHeight = Math.max(20, resizeStart.origSize + delta);
        setRowHeights(prev => ({ ...prev, [resizing.index]: newHeight }));
      }
    };
    const handleMouseUp2 = () => {
      setResizing(null);
      setResizeStart(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp2);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp2);
    };
  }, [resizing, resizeStart]);

  const applyStyleToSelection = (styleUpdate) => {
    getSelectedCells().forEach(({ r, c }) => {
      const cell = getCell(r, c);
      updateCell(r, c, { style: { ...cell.style, ...styleUpdate } });
    });
    setActivePanel(null);
    setContextMenu(null);
  };

  const deleteCells = () => {
    getSelectedCells().forEach(({ r, c }) => updateCell(r, c, { value: '', style: {} }));
    setContextMenu(null);
  };

  const addRow = () => setRows(prev => prev + 5);
  const removeRow = () => setRows(prev => Math.max(5, prev - 1));
  const addCol = () => setCols(prev => prev + 2);
  const removeCol = () => setCols(prev => Math.max(3, prev - 1));

  // Copy cells to clipboard
  const copyCells = () => {
    const selected = getSelectedCells();
    if (selected.length === 0) return;
    const r1 = Math.min(...selected.map(s => s.r));
    const c1 = Math.min(...selected.map(s => s.c));
    const data = selected.map(({ r, c }) => ({
      dr: r - r1, dc: c - c1,
      ...getCell(r, c)
    }));
    setClipboard({ data, rows: Math.max(...data.map(d => d.dr)) + 1, cols: Math.max(...data.map(d => d.dc)) + 1 });
    setContextMenu(null);
  };

  // Paste cells from clipboard
  const pasteCells = () => {
    if (!clipboard || !selectedCell) return;
    clipboard.data.forEach(({ dr, dc, value, style, linkedMachine }) => {
      const tr = selectedCell.r + dr;
      const tc = selectedCell.c + dc;
      if (tr < rows && tc < cols) {
        updateCell(tr, tc, { value: value || '', style: style || {}, linkedMachine: linkedMachine || null });
      }
    });
    setContextMenu(null);
  };

  // Fill down
  const fillDown = () => {
    const selected = getSelectedCells();
    if (selected.length < 2) return;
    const c1 = Math.min(...selected.map(s => s.c));
    const c2 = Math.max(...selected.map(s => s.c));
    const r1 = Math.min(...selected.map(s => s.r));
    const r2 = Math.max(...selected.map(s => s.r));
    // Use first row as source
    for (let c = c1; c <= c2; c++) {
      const srcCell = getCell(r1, c);
      for (let r = r1 + 1; r <= r2; r++) {
        updateCell(r, c, { value: srcCell.value || '', style: { ...srcCell.style } });
      }
    }
    setContextMenu(null);
  };

  // Fill right
  const fillRight = () => {
    const selected = getSelectedCells();
    if (selected.length < 2) return;
    const c1 = Math.min(...selected.map(s => s.c));
    const c2 = Math.max(...selected.map(s => s.c));
    const r1 = Math.min(...selected.map(s => s.r));
    const r2 = Math.max(...selected.map(s => s.r));
    // Use first col as source
    for (let r = r1; r <= r2; r++) {
      const srcCell = getCell(r, c1);
      for (let c = c1 + 1; c <= c2; c++) {
        updateCell(r, c, { value: srcCell.value || '', style: { ...srcCell.style } });
      }
    }
    setContextMenu(null);
  };

  // Insert row above selected
  const insertRowAbove = () => {
    if (!selectedCell) return;
    const r = selectedCell.r;
    setCells(prev => {
      const newCells = {};
      for (const [key, val] of Object.entries(prev)) {
        const [cr, cc] = key.split('-').map(Number);
        if (cr >= r) {
          newCells[cellKey(cr + 1, cc)] = val;
        } else {
          newCells[key] = val;
        }
      }
      return newCells;
    });
    setRows(prev => prev + 1);
    setContextMenu(null);
  };

  // Insert row below selected
  const insertRowBelow = () => {
    if (!selectedCell) return;
    const r = selectedCell.r + 1;
    setCells(prev => {
      const newCells = {};
      for (const [key, val] of Object.entries(prev)) {
        const [cr, cc] = key.split('-').map(Number);
        if (cr >= r) {
          newCells[cellKey(cr + 1, cc)] = val;
        } else {
          newCells[key] = val;
        }
      }
      return newCells;
    });
    setRows(prev => prev + 1);
    setContextMenu(null);
  };

  // Insert column left
  const insertColLeft = () => {
    if (!selectedCell) return;
    const c = selectedCell.c;
    setCells(prev => {
      const newCells = {};
      for (const [key, val] of Object.entries(prev)) {
        const [cr, cc] = key.split('-').map(Number);
        if (cc >= c) {
          newCells[cellKey(cr, cc + 1)] = val;
        } else {
          newCells[key] = val;
        }
      }
      return newCells;
    });
    setCols(prev => prev + 1);
    setContextMenu(null);
  };

  // Insert column right
  const insertColRight = () => {
    if (!selectedCell) return;
    const c = selectedCell.c + 1;
    setCells(prev => {
      const newCells = {};
      for (const [key, val] of Object.entries(prev)) {
        const [cr, cc] = key.split('-').map(Number);
        if (cc >= c) {
          newCells[cellKey(cr, cc + 1)] = val;
        } else {
          newCells[key] = val;
        }
      }
      return newCells;
    });
    setCols(prev => prev + 1);
    setContextMenu(null);
  };

  // Delete selected row
  const deleteSelectedRow = () => {
    if (!selectedCell) return;
    const r = selectedCell.r;
    setCells(prev => {
      const newCells = {};
      for (const [key, val] of Object.entries(prev)) {
        const [cr, cc] = key.split('-').map(Number);
        if (cr === r) continue;
        if (cr > r) {
          newCells[cellKey(cr - 1, cc)] = val;
        } else {
          newCells[key] = val;
        }
      }
      return newCells;
    });
    setRows(prev => Math.max(1, prev - 1));
    setContextMenu(null);
  };

  // Delete selected column
  const deleteSelectedCol = () => {
    if (!selectedCell) return;
    const c = selectedCell.c;
    setCells(prev => {
      const newCells = {};
      for (const [key, val] of Object.entries(prev)) {
        const [cr, cc] = key.split('-').map(Number);
        if (cc === c) continue;
        if (cc > c) {
          newCells[cellKey(cr, cc - 1)] = val;
        } else {
          newCells[key] = val;
        }
      }
      return newCells;
    });
    setCols(prev => Math.max(1, prev - 1));
    setContextMenu(null);
  };

  const linkToMachine = (machineId) => {
    if (selectedCell) {
      updateCell(selectedCell.r, selectedCell.c, {
        linkedMachine: machineId,
        value: `stanok:${machineId}`,
      });
    }
    setActivePanel(null);
    setContextMenu(null);
  };

  const unlinkMachine = () => {
    if (selectedCell) {
      updateCell(selectedCell.r, selectedCell.c, {
        linkedMachine: null,
        value: '',
      });
    }
    setContextMenu(null);
  };

  const getCurrentShift = () => {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 7 && hour < 19) return { type: 'KUNDUZ', label: 'Kunduzgi', shift: 1 };
    return { type: 'TUN', label: 'Tungi', shift: 2 };
  };

  // Calculate total machine meters
  const totalMachineMeters = useCallback(() => {
    let total = 0;
    machines.forEach(m => {
      total += (m.shift_meters || 0);
    });
    return total.toFixed(1);
  }, [machines]);

  const renderCellValue = (r, c) => {
    const cell = getCell(r, c);
    if (cell.linkedMachine) {
      const machine = machines.find(m => m.id === cell.linkedMachine);
      const shift = getCurrentShift();
      const meters = machine ? (machine.shift_meters || 0).toFixed(1) : '0.0';
      const statusColor = machine?.status === 'RUNNING' ? '#39ff14' : machine?.status === 'OFFLINE' ? '#ff3131' : '#ffea00';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', lineHeight: 1.2 }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 800, color: statusColor }}>{cell.linkedMachine}</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>{meters}m</span>
          <span style={{ fontSize: '0.5rem', color: '#94a3b8', fontWeight: 600 }}>{shift.label}</span>
        </div>
      );
    }
    return cell.value;
  };

  const getCellStyle = (r, c) => {
    const cell = getCell(r, c);
    const isSelected = (selectedCell && selectedCell.r === r && selectedCell.c === c) ||
      (selectedRange && r >= Math.min(selectedRange.r1, selectedRange.r2) &&
        r <= Math.max(selectedRange.r1, selectedRange.r2) &&
        c >= Math.min(selectedRange.c1, selectedRange.c2) &&
        c <= Math.max(selectedRange.c1, selectedRange.c2));

    return {
      background: isSelected ? 'rgba(0, 210, 255, 0.15)' : (cell.style?.background || 'transparent'),
      border: isSelected ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.06)',
      color: cell.style?.color || '#f8fafc',
      fontWeight: cell.style?.fontWeight || 400,
      fontStyle: cell.style?.fontStyle || 'normal',
      textDecoration: cell.style?.textDecoration || 'none',
      fontSize: cell.style?.fontSize ? `${cell.style.fontSize}px` : '0.8rem',
      fontFamily: cell.style?.fontFamily || 'Inter',
      textAlign: cell.style?.textAlign || 'center',
    };
  };

  const handleSave = () => {
    const data = { rows, cols, cells, title, colWidths, rowHeights, mergedCells };
    if (onSave) onSave(data);
  };

  const handleExportPDF = () => {
    if (onSave) onSave({ rows, cols, cells, title, colWidths, rowHeights, mergedCells, exportPDF: true });
  };

  const mergeCells = () => {
    if (!selectedRange) return;
    const r1 = Math.min(selectedRange.r1, selectedRange.r2);
    const r2 = Math.max(selectedRange.r1, selectedRange.r2);
    const c1 = Math.min(selectedRange.c1, selectedRange.c2);
    const c2 = Math.max(selectedRange.c1, selectedRange.c2);
    if (r1 === r2 && c1 === c2) return;
    
    const mergeKey = `${r1}-${c1}`;
    const newMerged = { ...mergedCells };
    newMerged[mergeKey] = { r1, r2, c1, c2 };
    setMergedCells(newMerged);
    setSelectedRange(null);
    setContextMenu(null);
  };

  const unmergeCells = () => {
    if (!selectedCell) return;
    const cellKey = `${selectedCell.r}-${selectedCell.c}`;
    const newMerged = { ...mergedCells };
    delete newMerged[cellKey];
    setMergedCells(newMerged);
    setContextMenu(null);
  };

  const getMergeInfo = (r, c) => {
    for (const [key, val] of Object.entries(mergedCells)) {
      if (r >= val.r1 && r <= val.r2 && c >= val.c1 && c <= val.c2) {
        if (val.r1 === r && val.c1 === c) {
          return { isMain: true, ...val };
        }
        return { isMain: false };
      }
    }
    return null;
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
        background: 'rgba(15,23,42,0.8)', borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexWrap: 'wrap', flexShrink: 0
      }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '6px 12px', color: '#f8fafc', fontSize: '0.9rem',
            fontWeight: 700, outline: 'none', width: '200px'
          }}
          placeholder="Sarlavha"
        />

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <ToolBtn icon={<Plus size={14} />} onClick={addRow} title="Qator qo'shish" />
        <ToolBtn icon={<Minus size={14} />} onClick={removeRow} title="Qator olib tashlash" />
        <ToolBtn icon={<Plus size={14} />} onClick={addCol} title="Ustun qo'shish" label="U" />
        <ToolBtn icon={<Minus size={14} />} onClick={removeCol} title="Ustun olib tashlash" label="U" />

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Matn joylashuvi tugmalari */}
        <ToolBtn icon={<AlignLeft size={14} />} onClick={() => applyStyleToSelection({ textAlign: 'left' })} title="Chapga" />
        <ToolBtn icon={<AlignCenter size={14} />} onClick={() => applyStyleToSelection({ textAlign: 'center' })} title="Markazga" />
        <ToolBtn icon={<AlignRight size={14} />} onClick={() => applyStyleToSelection({ textAlign: 'right' })} title="O'ngga" />

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        {/* Avto kengayish tugmasi */}
        <ToolBtn
          icon={autoResize ? <Shrink size={14} /> : <Expand size={14} />}
          onClick={() => {
            const newState = !autoResize;
            setAutoResize(newState);
            if (newState) autoResizeAll();
          }}
          title={autoResize ? "Avto kengayishni o'chirish" : "Avto kengayishni yoqish"}
          label={autoResize ? 'Auto ON' : 'Auto OFF'}
          active={autoResize}
          color={autoResize ? '#39ff14' : undefined}
        />

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

        <ToolBtn icon={<Palette size={14} />} onClick={() => setActivePanel(activePanel === 'color' ? null : 'color')} title="Rang" active={activePanel === 'color'} />
        <ToolBtn icon={<Type size={14} />} onClick={() => setActivePanel(activePanel === 'font' ? null : 'font')} title="Shrift" active={activePanel === 'font'} />
        <ToolBtn icon={<Link2 size={14} />} onClick={() => setActivePanel(activePanel === 'machine' ? null : 'machine')} title="Stanok bog'lash" active={activePanel === 'machine'} />
        <ToolBtn icon={<Merge size={14} />} onClick={mergeCells} title="Kataklarni birlashtirish" disabled={!selectedRange} />
        <ToolBtn icon={<Trash2 size={14} />} onClick={deleteCells} title="O'chirish" />

        <div style={{ flex: 1 }} />

        {/* Total meters display */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '6px 12px', borderRadius: '8px',
          background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.2)',
          color: '#39ff14', fontSize: '0.75rem', fontWeight: 700
        }}>
          Jami metr: {totalMachineMeters()}m
        </div>

        <ToolBtn icon={<Save size={14} />} onClick={handleSave} title="Saqlash" label="Saqlash" color="#39ff14" />
        <ToolBtn icon={<FileDown size={14} />} onClick={handleExportPDF} title="PDF" label="PDF" color="#00d2ff" />
      </div>

      {/* Floating panels */}
      {activePanel === 'color' && (
        <FloatingPanel title="Katakchani bo'yash" x={200} y={60} onClose={() => setActivePanel(null)}>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>Orqa fon</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {CELL_COLORS.map(c => (
                <button key={c.value} onClick={() => applyStyleToSelection({ background: c.value })}
                  style={{
                    width: '28px', height: '28px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
                    background: c.value === 'transparent' ? 'repeating-conic-gradient(#333 0% 25%, #555 0% 50%) 50%/12px 12px' : c.value,
                    cursor: 'pointer', transition: '0.2s'
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>Matn rangi</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {COLORS.map(color => (
                <button key={color} onClick={() => applyStyleToSelection({ color })}
                  style={{
                    width: '28px', height: '28px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
                    background: color, cursor: 'pointer', transition: '0.2s'
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', gap: '4px' }}>
            <button onClick={() => applyStyleToSelection({ fontWeight: 700 })} style={panelBtnStyle}>B</button>
            <button onClick={() => applyStyleToSelection({ fontStyle: 'italic' })} style={panelBtnStyle}><i>I</i></button>
            <button onClick={() => applyStyleToSelection({ textDecoration: 'underline' })} style={panelBtnStyle}><u>U</u></button>
            <button onClick={() => applyStyleToSelection({ textAlign: 'left' })} style={panelBtnStyle}>←</button>
            <button onClick={() => applyStyleToSelection({ textAlign: 'center' })} style={panelBtnStyle}>≡</button>
            <button onClick={() => applyStyleToSelection({ textAlign: 'right' })} style={panelBtnStyle}>→</button>
          </div>
        </FloatingPanel>
      )}

      {activePanel === 'font' && (
        <FloatingPanel title="Shrift" x={280} y={60} onClose={() => setActivePanel(null)}>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>Shrift turi</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {FONTS.map(f => (
                <button key={f} onClick={() => applyStyleToSelection({ fontFamily: f })}
                  style={{
                    ...panelBtnStyle, fontFamily: f, justifyContent: 'flex-start', textAlign: 'left'
                  }}
                >{f}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>O'lcham</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {SIZES.map(s => (
                <button key={s} onClick={() => applyStyleToSelection({ fontSize: s })}
                  style={{ ...panelBtnStyle, minWidth: '36px' }}
                >{s}</button>
              ))}
            </div>
          </div>
        </FloatingPanel>
      )}

      {activePanel === 'machine' && (
        <FloatingPanel title="Stanok bog'lash" x={360} y={60} onClose={() => setActivePanel(null)}>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {machines.length === 0 && <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Stanoklar yuklanmoqda...</div>}
            {machines.map(m => {
              const shift = getCurrentShift();
              const meters = m ? (m.shift_meters || 0).toFixed(1) : '0.0';
              const statusColor = m.status === 'RUNNING' ? '#39ff14' : m.status === 'OFFLINE' ? '#ff3131' : '#ffea00';
              return (
                <button key={m.id} onClick={() => linkToMachine(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    padding: '8px 12px', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px',
                    cursor: 'pointer', color: '#f8fafc', marginBottom: '4px', textAlign: 'left',
                    transition: '0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,210,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                >
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%', background: statusColor,
                    boxShadow: `0 0 6px ${statusColor}`
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.8rem' }}>{m.id}</div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{shift.label} smena: {meters}m</div>
                  </div>
                  <Link2 size={14} color="#00d2ff" />
                </button>
              );
            })}
          </div>
        </FloatingPanel>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000,
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px',
            padding: '6px', minWidth: '220px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            animation: 'slideIn 0.15s ease'
          }}>
            <CtxItem icon={<Palette size={15} />} label="Bo'yash" onClick={() => { setActivePanel('color'); setContextMenu(null); }} />
            <CtxItem icon={<Link2 size={15} />} label="Stanok bog'lash" onClick={() => { setActivePanel('machine'); setContextMenu(null); }} />
            {selectedCell && getCell(selectedCell.r, selectedCell.c).linkedMachine && (
              <CtxItem icon={<X size={15} />} label="Bog'lashni o'chirish" onClick={unlinkMachine} color="#ff3131" />
            )}
            <CtxItem icon={<Type size={15} />} label="Formatlash" onClick={() => { setActivePanel('font'); setContextMenu(null); }} />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <div style={{ display: 'flex', gap: '2px', padding: '0 4px' }}>
              <button onClick={() => applyStyleToSelection({ textAlign: 'left' })} style={{
                flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}><AlignLeft size={14} /></button>
              <button onClick={() => applyStyleToSelection({ textAlign: 'center' })} style={{
                flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}><AlignCenter size={14} /></button>
              <button onClick={() => applyStyleToSelection({ textAlign: 'right' })} style={{
                flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}><AlignRight size={14} /></button>
            </div>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <CtxItem icon={<Copy size={15} />} label="Nusxalash (Ctrl+C)" onClick={copyCells} />
            <CtxItem icon={<Clipboard size={15} />} label="Qo'yish (Ctrl+V)" onClick={pasteCells} />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <CtxItem icon={<ArrowDown size={15} />} label="Pastga to'ldirish" onClick={fillDown} />
            <CtxItem icon={<ArrowRight size={15} />} label="O'ngga to'ldirish" onClick={fillRight} />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <CtxItem icon={<Rows3 size={15} />} label="Yuqoriga qator qo'shish" onClick={insertRowAbove} />
            <CtxItem icon={<Rows3 size={15} />} label="Pastga qator qo'shish" onClick={insertRowBelow} />
            <CtxItem icon={<Columns3 size={15} />} label="Chapga ustun qo'shish" onClick={insertColLeft} />
            <CtxItem icon={<Columns3 size={15} />} label="O'ngga ustun qo'shish" onClick={insertColRight} />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <CtxItem icon={<Merge size={15} />} label="Birlashtirish" onClick={mergeCells} disabled={!selectedRange} />
            {selectedCell && getMergeInfo(selectedCell.r, selectedCell.c) && (
              <CtxItem icon={<Merge size={15} />} label="Birlashtirishni buzish" onClick={unmergeCells} color="#ff3131" />
            )}
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <CtxItem icon={<Trash2 size={15} />} label="Qatorni o'chirish" onClick={deleteSelectedRow} color="#ff3131" />
            <CtxItem icon={<Trash2 size={15} />} label="Ustunni o'chirish" onClick={deleteSelectedCol} color="#ff3131" />
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
            <CtxItem icon={<Trash2 size={15} />} label="Kataklarni tozalash" onClick={deleteCells} color="#ff3131" />
          </div>
        </>
      )}

      {/* Table */}
      <div ref={tableRef} style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <table style={{
          borderCollapse: 'collapse', width: 'auto',
          tableLayout: 'fixed'
        }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', top: 0, left: 0, zIndex: 30,
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)',
                padding: '4px', width: '50px', minWidth: '50px',
                fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700
              }}>
                <Grid3X3 size={14} />
              </th>
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} style={{
                  position: 'sticky', top: 0, zIndex: 20,
                  background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)',
                  padding: '6px 2px', width: `${colWidths[c] || 80}px`, minWidth: `${colWidths[c] || 80}px`,
                  fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800,
                  letterSpacing: '1px', userSelect: 'none'
                }}>
                  {colLabel(c)}
                  <div
                    onMouseDown={(e) => handleColResizeStart(c, e)}
                    onDoubleClick={() => autoResizeColumn(c)}
                    style={{
                      position: 'absolute', right: -2, top: 0, bottom: 0, width: '6px',
                      cursor: 'col-resize', zIndex: 25
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 10,
                  background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)',
                  padding: '4px 8px', textAlign: 'center',
                  fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700,
                  userSelect: 'none', width: '50px', height: `${rowHeights[r] || 36}px`,
                }}>
                  {r + 1}
                  <div
                    onMouseDown={(e) => handleRowResizeStart(r, e)}
                    onDoubleClick={() => autoResizeRow(r)}
                    style={{
                      position: 'absolute', bottom: -2, left: 0, right: 0, height: '6px',
                      cursor: 'row-resize', zIndex: 15
                    }}
                  />
                </td>
                {Array.from({ length: cols }, (_, c) => {
                  const cell = getCell(r, c);
                  return (
                    <td
                      key={c}
                      onClick={(e) => handleCellClick(r, c, e)}
                      onDoubleClick={() => handleCellDoubleClick(r, c)}
                      onContextMenu={(e) => handleContextMenu(r, c, e)}
                      onMouseDown={(e) => handleCellMouseDown(r, c, e)}
                      onMouseEnter={() => handleCellMouseEnter(r, c)}
                      style={{
                        ...getCellStyle(r, c),
                        height: `${rowHeights[r] || 36}px`,
                        width: `${colWidths[c] || 80}px`,
                        minWidth: `${colWidths[c] || 80}px`,
                        padding: '2px 4px',
                        position: 'relative',
                        cursor: 'cell',
                        userSelect: 'none',
                        transition: 'background 0.1s',
                        overflow: 'hidden',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {(() => {
                        const mergeInfo = getMergeInfo(r, c);
                        if (mergeInfo && !mergeInfo.isMain) return null;
                        return editMode && selectedCell?.r === r && selectedCell?.c === c ? (
                          <input
                            ref={editRef}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={handleEditFinish}
                            style={{
                              width: '100%', height: '100%', border: 'none', outline: 'none',
                              background: 'transparent', color: '#f8fafc', fontSize: 'inherit',
                              fontFamily: 'inherit', textAlign: 'inherit', padding: 0
                            }}
                          />
                        ) : (
                          renderCellValue(r, c)
                        );
                      })()}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ToolBtn = ({ icon, onClick, title, label, active, color, disabled }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      padding: '6px 8px', borderRadius: '8px',
      border: active ? '1px solid var(--primary)' : '1px solid transparent',
      background: active ? 'rgba(0,210,255,0.15)' : 'rgba(255,255,255,0.05)',
      color: disabled ? '#475569' : (color || (active ? 'var(--primary)' : '#94a3b8')),
      cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.7rem', fontWeight: 700,
      transition: '0.2s', whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1
    }}
  >
    {icon}
    {label && <span>{label}</span>}
  </button>
);

const CtxItem = ({ icon, label, onClick, color, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      width: '100%', padding: '8px 12px', borderRadius: '8px',
      border: 'none', background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer',
      color: disabled ? '#64748b' : (color || '#f8fafc'), fontSize: '0.78rem', fontWeight: 600,
      textAlign: 'left', transition: '0.15s', opacity: disabled ? 0.5 : 1
    }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
  >
    {icon} {label}
  </button>
);

const FloatingPanel = ({ title, children, x, y, onClose }) => (
  <div style={{
    position: 'absolute', top: '48px', left: '50%', transform: 'translateX(-50%)',
    zIndex: 50, background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '16px', padding: '16px', minWidth: '260px', maxWidth: '350px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', animation: 'slideIn 0.2s ease'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
      <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>{title}</span>
      <button onClick={onClose} style={{
        background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '6px',
        padding: '4px', cursor: 'pointer', color: '#94a3b8', display: 'flex'
      }}><X size={14} /></button>
    </div>
    {children}
  </div>
);

const panelBtnStyle = {
  padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.05)', color: '#f8fafc', cursor: 'pointer',
  fontSize: '0.75rem', fontWeight: 700, transition: '0.15s', display: 'flex',
  alignItems: 'center', justifyContent: 'center'
};

export default ExcelTable;