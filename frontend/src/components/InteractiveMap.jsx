import React, { useRef, useEffect, useState } from 'react';

const InteractiveMap = ({ machines, onSelectMachine, selectedMachine }) => {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  const layout = isMobile
    ? { width: 720, height: 860, xScale: 0.68, yScale: 1.03, xBase: 30, yBase: 30 }
    : { width: 1000, height: 800, xScale: 1, yScale: 1, xBase: 0, yBase: 0 };

  const scaleXPos = (value) => {
    if (!isMobile) return value;
    return layout.xBase + (value - 30) * layout.xScale;
  };

  const scaleYPos = (value) => {
    if (!isMobile) return value;
    return layout.yBase + (value - 30) * layout.yScale;
  };

  const scaleWidth = (value) => {
    if (!isMobile) return value;
    return Math.max(42, value * 0.95);
  };

  const scaleHeight = (value) => {
    if (!isMobile) return value;
    return Math.max(34, value * 0.98);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (!parent) return;
        
        const containerWidth = Math.max(parent.clientWidth - (isMobile ? 8 : 24), 240);
        const containerHeight = Math.max(parent.clientHeight - (isMobile ? 8 : 24), isMobile ? 420 : 520);
        
        const baseWidth = layout.width;
        const baseHeight = layout.height;
        
        const scaleX = containerWidth / baseWidth;
        const scaleY = containerHeight / baseHeight;
        
        let finalScale = Math.min(scaleX, scaleY);
        
        if (isMobile) {
          finalScale = Math.min(finalScale * 1.03, 0.95);
        } else {
          finalScale = Math.min(finalScale * 1.02, 1.2);
        }
        
        setScale(finalScale);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, layout.height, layout.width]);

  const nodeWidth = 54;
  const nodeHeight = 40;
  const gapX = 65;
  const gapY = 70;

  const generateMainBlock = () => {
    const nodes = [];
    const roomRight = 720;
    const roomTop = 280;

    const rowCounts1 = [10, 10, 10, 10, 9];
    let id = 1;
    rowCounts1.forEach((count, rowIdx) => {
      const rowWidth = count * gapX;
      const startX = roomRight - rowWidth;
      const y = roomTop + rowIdx * gapY;
      for (let i = count - 1; i >= 0; i--) {
        nodes.push({ id: id++, x: startX + i * gapX, y, w: nodeWidth, h: nodeHeight });
      }
    });

    const rowCounts2 = [6, 4];
    rowCounts2.forEach((count, rowIdx) => {
      const rowWidth = count * gapX;
      const startX = roomRight - rowWidth;
      const y = roomTop + (5 + rowIdx) * gapY;
      for (let i = count - 1; i >= 0; i--) {
        nodes.push({ id: id++, x: startX + i * gapX, y, w: nodeWidth, h: nodeHeight });
      }
    });

    return nodes;
  };

  const generateRightBlock = () => {
    const nodes = [];
    const startX = 870;
    const startY = 80;
    const gapYBlock = 75;
    for (let i = 0; i < 9; i++) {
      nodes.push({ id: 60 + i, x: startX, y: startY + i * gapYBlock, w: nodeWidth, h: nodeHeight });
    }
    return nodes;
  };

  const allNodes = [...generateMainBlock(), ...generateRightBlock()];

  const walls = [
    { x1: 30, y1: 30, x2: 960, y2: 30 },
    { x1: 30, y1: 30, x2: 30, y2: 760 },
    { x1: 960, y1: 30, x2: 960, y2: 760 },
    { x1: 30, y1: 760, x2: 960, y2: 760 },
    { x1: 280, y1: 30, x2: 280, y2: 230 },
    { x1: 30, y1: 230, x2: 720, y2: 230 },
    { x1: 720, y1: 30, x2: 720, y2: 760 },
    { x1: 30, y1: 500, x2: 180, y2: 760 },
  ];

  const transformedNodes = allNodes.map((node) => ({
    ...node,
    x: scaleXPos(node.x),
    y: scaleYPos(node.y),
    w: scaleWidth(node.w),
    h: scaleHeight(node.h),
  }));

  const transformedWalls = walls.map((wall) => ({
    x1: scaleXPos(wall.x1),
    y1: scaleYPos(wall.y1),
    x2: scaleXPos(wall.x2),
    y2: scaleYPos(wall.y2),
  }));

  return (
    <div className="factory-map-container" ref={containerRef} style={{
      width: '100%',
      height: '100%',
      minHeight: isMobile ? '420px' : '520px',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '12px'
    }}>
      <div className="interactive-map" style={{ 
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        width: `${layout.width}px`,
        height: `${layout.height}px`
      }}>
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          {transformedWalls.map((w, i) => (
            <line key={`w${i}`} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2}
              stroke="#475569" strokeWidth="2" />
          ))}
        </svg>

        <div style={{ position: 'absolute', left: scaleXPos(80), top: scaleYPos(110), color: '#64748b', fontSize: isMobile ? '0.68rem' : '0.75rem', fontWeight: 700, letterSpacing: isMobile ? '1.4px' : '2px', textTransform: 'uppercase', pointerEvents: 'none' }}>XOMASHYO OMBORI</div>
        <div style={{ position: 'absolute', left: scaleXPos(380), top: scaleYPos(110), color: '#64748b', fontSize: isMobile ? '0.68rem' : '0.75rem', fontWeight: 700, letterSpacing: isMobile ? '1.4px' : '2px', textTransform: 'uppercase', pointerEvents: 'none' }}>IP YIGIRUV XONASI</div>

        {[200, 500, 800].map((x, i) => (
          <div key={`exit${i}`} style={{
            position: 'absolute', left: scaleXPos(x), top: scaleYPos(10),
            background: '#22c55e', padding: isMobile ? '5px 10px' : '4px 14px', borderRadius: '6px',
            fontSize: isMobile ? '0.6rem' : '0.65rem', fontWeight: 800, color: '#064e3b',
            boxShadow: '0 0 10px rgba(34,197,94,0.3)', pointerEvents: 'none'
          }}>▲ CHIQISH</div>
        ))}

        {transformedNodes.map((node) => {
          const machineData = machines.find((m) => m.id === `S${node.id}`) || { status: 'DISCONNECTED' };
          
          let statusColor = '#64748b';
          let isRunning = false;

          switch (machineData.status) {
            case 'RUNNING': 
              statusColor = '#22c55e'; 
              isRunning = true;
              break;
            case 'ASNOVA_EMPTY': statusColor = '#b45309'; break;
            case 'NO_SIGNAL':
            case 'ESP_ONLINE_NO_SIGNAL': statusColor = '#a855f7'; break;
            case 'OFFLINE':
            case 'DISCONNECTED': statusColor = '#64748b'; break;
            case 'UZLAVYAZ_COMPLETE': statusColor = '#f59e0b'; break;
            default: break;
          }

          const isFocused = selectedMachine?.id === `S${node.id}`;

          return (
            <div
              key={node.id}
              className={`machine-node ${isRunning ? 'pulse-neon' : ''} ${isFocused ? 'is-focused' : ''}`}
              style={{ 
                left: `${node.x}px`, 
                top: `${node.y}px`, 
                width: `${node.w}px`, 
                height: `${node.h}px`,
                borderColor: statusColor,
              }}
              onClick={() => onSelectMachine({ ...machineData, id: `S${node.id}` })}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <svg width="24" height="18" viewBox="0 0 24 24" fill={statusColor} style={{ opacity: machineData.status === 'DISCONNECTED' ? 0.3 : 1 }}>
                  <path d="M2,14 L2,18 L22,18 L22,14 M4,14 L4,6 L20,6 L20,14 M6,10 L18,10 M2,8 L2,20 L22,20 L22,8 L20,8 L20,4 L4,4 L4,8 Z" />
                </svg>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: statusColor }}>
                  {node.id}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InteractiveMap;
