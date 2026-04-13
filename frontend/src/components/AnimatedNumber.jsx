import React, { useState, useEffect, useRef } from 'react';

const AnimatedNumber = ({ value, suffix = '', decimals = 1, duration = 500 }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);
  const animationRef = useRef(null);
  
  useEffect(() => {
    const startValue = prevValue.current;
    const endValue = value || 0;
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeOutQuad = 1 - (1 - progress) * (1 - progress);
      const currentValue = startValue + (endValue - startValue) * easeOutQuad;
      
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = endValue;
      }
    };
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);
  
  const formatted = displayValue.toFixed(decimals);
  return <span>{formatted}{suffix}</span>;
};

export default AnimatedNumber;

export const WifiSignal = ({ rssi, ssid }) => {
  const getSignalStrength = (rssi) => {
    if (!rssi || rssi === 0) return 'none';
    if (rssi > -50) return 'excellent';
    if (rssi > -60) return 'good';
    if (rssi > -70) return 'fair';
    return 'weak';
  };
  
  const getSignalBars = (rssi) => {
    if (!rssi || rssi === 0) return 0;
    if (rssi > -50) return 4;
    if (rssi > -60) return 3;
    if (rssi > -70) return 2;
    if (rssi > -80) return 1;
    return 0;
  };
  
  const strength = getSignalStrength(rssi);
  const bars = getSignalBars(rssi);
  const colors = {
    excellent: '#22c55e',
    good: '#84cc16',
    fair: '#eab308',
    weak: '#f97316',
    none: '#94a3b8'
  };
  
  return (
    <div className="wifi-signal" title={`${ssid || 'N/A'} (${rssi || 0} dBm)`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors[strength]} strokeWidth="2">
        <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
        <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" opacity={bars >= 1 ? 1 : 0.2}/>
        <circle cx="12" cy="20" r="1" fill={bars >= 1 ? colors[strength] : '#94a3b8'}/>
      </svg>
      <span style={{ color: colors[strength], fontSize: '0.75rem', marginLeft: '4px' }}>
        {bars > 0 ? `${bars}` : '-'}
      </span>
    </div>
  );
};