import { useEffect, useRef, useState } from 'react';

/** Beeps without an audio file, so the app stays a single self-contained bundle. */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // Audio blocked until the user interacts — not worth surfacing.
  }
}

export function RestTimer({
  seconds,
  sound,
  onDismiss,
}: {
  seconds: number;
  sound: boolean;
  onDismiss: () => void;
}) {
  // Anchor to wall-clock time: setInterval drifts badly when the phone screen sleeps.
  const endsAt = useRef(Date.now() + seconds * 1000);
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);

  useEffect(() => {
    endsAt.current = Date.now() + seconds * 1000;
    fired.current = false;
    setLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.round((endsAt.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0 && !fired.current) {
        fired.current = true;
        if (sound) beep();
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
      }
    };
    const id = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [sound]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="resttimer">
      <div className="time">
        {mm}:{ss}
      </div>
      <div className="bar">
        <span style={{ width: `${(left / seconds) * 100}%` }} />
      </div>
      <button className="btn btn--ghost" onClick={onDismiss} style={{ padding: '8px 12px' }}>
        Skip
      </button>
    </div>
  );
}
