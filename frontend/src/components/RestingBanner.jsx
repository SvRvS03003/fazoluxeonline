import React, { useEffect, useMemo, useRef, useState } from 'react';

const ENTER_DURATION_MS = 980;
const EXIT_DURATION_MS = 420;

const RestingBanner = ({ names = [], variant = 'mobile' }) => {
  const normalizedNames = useMemo(
    () => (Array.isArray(names) ? names.filter(Boolean) : []),
    [names]
  );
  const namesSignature = normalizedNames.join('|');
  const [displayNames, setDisplayNames] = useState([]);
  const [phase, setPhase] = useState('hidden');
  const [shouldRender, setShouldRender] = useState(false);
  const [enterCycle, setEnterCycle] = useState(0);
  const enterTimerRef = useRef(null);
  const exitTimerRef = useRef(null);
  const phaseRef = useRef('hidden');
  const shouldRenderRef = useRef(false);

  const clearTimers = () => {
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    phaseRef.current = phase;
    shouldRenderRef.current = shouldRender;
  }, [phase, shouldRender]);

  useEffect(() => {
    clearTimers();

    if (normalizedNames.length > 0) {
      setDisplayNames(normalizedNames);

      if (!shouldRenderRef.current || phaseRef.current === 'hidden' || phaseRef.current === 'exiting') {
        setShouldRender(true);
        setPhase('entering');
        setEnterCycle(prev => prev + 1);
        enterTimerRef.current = setTimeout(() => {
          setPhase('visible');
        }, ENTER_DURATION_MS);
      } else {
        setPhase('visible');
      }

      return;
    }

    if (shouldRenderRef.current) {
      setPhase('exiting');
      exitTimerRef.current = setTimeout(() => {
        setShouldRender(false);
        setDisplayNames([]);
        setPhase('hidden');
      }, EXIT_DURATION_MS);
    }
  }, [namesSignature]);

  if (!shouldRender || displayNames.length === 0) {
    return null;
  }

  return (
    <div
      className={`resting-banner resting-banner--${variant} is-${phase}`}
      aria-live="polite"
    >
      <div className="resting-banner-card">
        <div className="resting-banner-head">
          <span className="resting-banner-icon" aria-hidden="true">
            🌴
          </span>
          <span className="resting-banner-title">
            <span
              key={`${variant}-title-${enterCycle}`}
              className="resting-banner-title-text"
            >
              Bugun dam olmoqda
            </span>
          </span>
        </div>

        <div className="resting-banner-names">
          {displayNames.map((name, index) => (
            <span
              key={`${name}-${index}`}
              className="resting-banner-chip"
              style={{ '--rest-chip-delay': `${0.18 + index * 0.08}s` }}
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RestingBanner;
