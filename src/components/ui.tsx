import type { ReactNode } from 'react';

export function Card({
  children,
  variant,
  className = '',
}: {
  children: ReactNode;
  variant?: 'accent' | 'good' | 'flush';
  className?: string;
}) {
  const v = variant ? ` card--${variant}` : '';
  return <div className={`card${v} ${className}`}>{children}</div>;
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'good' | 'warn' | 'accent' }) {
  return <span className={`pill${tone ? ` pill--${tone}` : ''}`}>{children}</span>;
}

export function Meter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="meter">
      <span className={pct >= 1 ? 'full' : ''} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const clamped = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(clamped(value - step))} aria-label="Decrease">
        −
      </button>
      <div className="value num">
        {value}
        {suffix ? <span className="muted" style={{ fontSize: 14 }}> {suffix}</span> : null}
      </div>
      <button type="button" onClick={() => onChange(clamped(value + step))} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">{children}</div>
    </div>
  );
}

export function Empty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h2>{title}</h2>
      <p className="small">{body}</p>
    </div>
  );
}
