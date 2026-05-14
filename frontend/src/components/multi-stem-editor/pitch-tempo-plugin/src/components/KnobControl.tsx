import React, { useCallback, useEffect, useRef, useState } from 'react';

interface KnobControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  formatValue?: (v: number) => string;
  onChange: (v: number) => void;
  color?: string;
  size?: number;
  disabled?: boolean;
}

export const KnobControl: React.FC<KnobControlProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  unit = '',
  formatValue,
  onChange,
  color = '#8b5cf6',
  size = 72,
  disabled = false,
}) => {
  const svgRef   = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const startY   = useRef(0);
  const startVal = useRef(0);
  const [focused, setFocused] = useState(false);

  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;

  const normalize = (v: number) => (v - min) / (max - min);
  const angle     = MIN_ANGLE + normalize(value) * (MAX_ANGLE - MIN_ANGLE);

  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const snap  = (v: number) => Math.round(v / step) * step;

  const displayValue = formatValue ? formatValue(value) :
    `${value >= 0 ? (unit === 'semitones' ? '+' : '') : ''}${value.toFixed(step < 0.1 ? 2 : 1)}${unit ? ` ${unit}` : ''}`;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragging.current = true;
    startY.current   = e.clientY;
    startVal.current = value;
  }, [disabled, value]);

  const handleDoubleClick = useCallback(() => {
    if (disabled) return;
    if (defaultValue !== undefined) onChange(defaultValue);
  }, [disabled, defaultValue, onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dy    = startY.current - e.clientY;
      const range = max - min;
      const delta = (dy / 200) * range;
      onChange(clamp(snap(startVal.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [min, max, step, onChange]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    const dir   = e.deltaY < 0 ? 1 : -1;
    const delta = dir * step * (e.shiftKey ? 10 : 1);
    onChange(clamp(snap(value + delta)));
  }, [disabled, value, min, max, step, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    const multiplier = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(clamp(snap(value + step * multiplier)));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(clamp(snap(value - step * multiplier)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    } else if (e.key === 'Backspace' && defaultValue !== undefined) {
      e.preventDefault();
      onChange(defaultValue);
    }
  }, [disabled, value, min, max, step, defaultValue, onChange]);

  // SVG geometry
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.38;
  const trackR  = r + size * 0.06;
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180);
  const px = (deg: number) => cx + trackR * Math.cos(toRad(deg));
  const py = (deg: number) => cy + trackR * Math.sin(toRad(deg));

  // Arc path
  const arcStart = MIN_ANGLE;
  const arcEnd   = angle;
  const startX = px(arcStart), startY2 = py(arcStart);
  const endX   = px(arcEnd),   endY2    = py(arcEnd);
  const largeArc = (arcEnd - arcStart) > 180 ? 1 : 0;
  const arcPath = `M ${startX} ${startY2} A ${trackR} ${trackR} 0 ${largeArc} 1 ${endX} ${endY2}`;

  // Indicator line
  const indLen = r * 0.55;
  const indX   = cx + indLen * Math.cos(toRad(angle));
  const indY   = cy + indLen * Math.sin(toRad(angle));

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        tabIndex={disabled ? -1 : 0}
        className={`cursor-pointer outline-none ${disabled ? 'opacity-40' : ''} ${focused ? 'drop-shadow-lg' : ''}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ touchAction: 'none' }}
      >
        {/* Glow filter */}
        <defs>
          <filter id={`glow-${label}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id={`knob-grad-${label}`} cx="40%" cy="35%">
            <stop offset="0%" stopColor="#4a4a6a"/>
            <stop offset="100%" stopColor="#1a1a2e"/>
          </radialGradient>
        </defs>

        {/* Track background */}
        <circle cx={cx} cy={cy} r={trackR} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.055}
          strokeDasharray={`${2 * Math.PI * trackR * 270/360} ${2 * Math.PI * trackR}`}
          strokeDashoffset={`${-2 * Math.PI * trackR * 45/360}`}
          strokeLinecap="round"
        />

        {/* Active arc */}
        {value !== min && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={size * 0.06}
            strokeLinecap="round"
            filter={`url(#glow-${label})`}
            opacity={disabled ? 0.4 : 1}
          />
        )}

        {/* Knob body */}
        <circle cx={cx} cy={cy} r={r}
          fill={`url(#knob-grad-${label})`}
          stroke={focused ? color : 'rgba(255,255,255,0.1)'}
          strokeWidth={focused ? 2 : 1}
        />

        {/* Indicator */}
        <line
          x1={cx} y1={cy}
          x2={indX} y2={indY}
          stroke={color}
          strokeWidth={size * 0.055}
          strokeLinecap="round"
          filter={`url(#glow-${label})`}
        />

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={size * 0.04} fill={color} opacity={0.8}/>
      </svg>
      <div className="text-sm font-mono font-bold" style={{ color }}>{displayValue}</div>
    </div>
  );
};
