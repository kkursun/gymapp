import { useState } from 'react';
import { describeChange, dueCheckIn } from '../engine/checkin';
import { readBody } from '../engine/body';
import { fmt } from '../engine/progression';
import { useStore } from '../store/StoreContext';
import { Card, Sheet, Stepper } from '../components/ui';

/**
 * The periodic nudge for fresh measurements. Every strength target in the app is derived
 * from bodyweight and height, so stale numbers quietly rot the whole plan.
 */
export function CheckInCard() {
  const { state, dispatch } = useStore();
  const profile = state.profile!;
  const check = dueCheckIn(state);
  const [open, setOpen] = useState(false);
  // Seed from the last logged weigh-in rather than the profile: the log is the record of
  // what was actually measured.
  const [kg, setKg] = useState(() => state.bodyweightLog[state.bodyweightLog.length - 1]?.kg ?? profile.bodyweightKg);
  const [cm, setCm] = useState(profile.heightCm);
  const [result, setResult] = useState<string | null>(null);

  if (!check && !result) return null;

  const before = readBody(profile);
  const after = readBody({ ...profile, bodyweightKg: kg, heightCm: cm });

  return (
    <>
      {check && (
        <Card>
          <div className="row" style={{ marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>{check.askHeight ? 'Measurement check-in' : 'Weekly weigh-in'}</h3>
            <span className="tiny">{check.daysSinceWeighIn} days</span>
          </div>
          <p className="small muted">{check.message}</p>
          <div className="btn-row">
            <button className="btn btn--ghost" onClick={() => dispatch({ type: 'snoozeCheckIn' })}>
              Not now
            </button>
            <button className="btn btn--primary" onClick={() => setOpen(true)}>
              Update
            </button>
          </div>
        </Card>
      )}

      {open && check && (
        <Sheet onClose={() => setOpen(false)}>
          <h2>{check.askHeight ? 'How are you measuring up?' : 'Weigh-in'}</h2>
          <p className="small muted">
            Weigh yourself at the same time of day — first thing in the morning is the most consistent.
          </p>
          <div className="field">
            <label>Bodyweight</label>
            <Stepper value={kg} onChange={setKg} step={0.1} min={35} max={250} suffix="kg" />
            <p className="hint num">Last time: {fmt(check.lastKg)}kg</p>
          </div>
          {check.askHeight && (
            <div className="field">
              <label>Height</label>
              <Stepper value={cm} onChange={setCm} min={130} max={220} suffix="cm" />
              <p className="hint">
                {profile.age < 20
                  ? 'You are still growing, so this is worth re-checking every couple of months.'
                  : 'Rarely changes, but worth confirming every six months.'}
              </p>
            </div>
          )}
          <Card>
            <div className="row">
              <div>
                <div className="tiny">Lean mass</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                  {before.lbm.toFixed(1)} → {after.lbm.toFixed(1)} kg
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tiny">BMI</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>{after.bmi.toFixed(1)}</div>
              </div>
            </div>
          </Card>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="btn btn--primary"
              onClick={() => {
                const previous = profile.bodyweightKg;
                dispatch({
                  type: 'checkIn',
                  kg: Math.round(kg * 10) / 10,
                  heightCm: check.askHeight ? cm : undefined,
                });
                setResult(describeChange(previous, kg));
                setOpen(false);
              }}
            >
              Save
            </button>
          </div>
        </Sheet>
      )}

      {result && (
        <Card variant="good">
          <div className="row">
            <p className="small" style={{ margin: 0 }}>{result}</p>
            <button className="btn btn--ghost small" style={{ padding: '4px 8px' }} onClick={() => setResult(null)}>
              Got it
            </button>
          </div>
        </Card>
      )}
    </>
  );
}
