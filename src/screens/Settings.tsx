import { useState } from 'react';
import { PROGRAMS } from '../data/programs';
import { readBody } from '../engine/body';
import { fmt } from '../engine/progression';
import { useStore } from '../store/StoreContext';
import { Card, Sheet, Stepper } from '../components/ui';
import { STORAGE_KEY } from '../store/state';

export function Settings() {
  const { state, dispatch } = useStore();
  const profile = state.profile!;
  const body = readBody(profile);
  const [switching, setSwitching] = useState(false);
  const [editBody, setEditBody] = useState(false);
  const [height, setHeight] = useState(profile.heightCm);
  const [weight, setWeight] = useState(profile.bodyweightKg);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ironpath-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (file: File) => {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text);
        if (!parsed.version || !parsed.lifts) throw new Error('not an Ironpath backup');
        dispatch({ type: 'import', state: parsed });
        alert('Backup restored.');
      } catch (e) {
        alert(`Could not read that file: ${(e as Error).message}`);
      }
    });
  };

  return (
    <div className="screen">
      <h1>Settings</h1>

      <div className="section-title"><h2 style={{ margin: 0 }}>You</h2></div>
      <Card>
        <div className="liftrow"><div className="lift-name">Name</div><span className="muted">{profile.name}</span></div>
        <div className="liftrow"><div className="lift-name">Age</div><span className="muted num">{profile.age}</span></div>
        <div className="liftrow"><div className="lift-name">Height</div><span className="muted num">{profile.heightCm} cm</span></div>
        <div className="liftrow"><div className="lift-name">Bodyweight</div><span className="muted num">{fmt(profile.bodyweightKg)} kg</span></div>
        <div className="liftrow"><div className="lift-name">Lean mass (est.)</div><span className="muted num">{body.lbm.toFixed(1)} kg</span></div>
        <div className="liftrow"><div className="lift-name">BMI</div><span className="muted num">{body.bmi.toFixed(1)}</span></div>
        <button className="btn btn--block" style={{ marginTop: 12 }} onClick={() => setEditBody(true)}>
          Update measurements
        </button>
      </Card>

      <div className="section-title"><h2 style={{ margin: 0 }}>Program</h2></div>
      <Card>
        <p className="small muted">
          The app moves you up on its own when you're ready. Change it here only if you want to override that.
        </p>
        <button className="btn btn--block" onClick={() => setSwitching(true)}>
          Switch program
        </button>
      </Card>

      <div className="section-title"><h2 style={{ margin: 0 }}>Equipment</h2></div>
      <Card>
        <div className="field">
          <label>Barbell weight</label>
          <Stepper
            value={state.settings.barKg}
            onChange={(v) => dispatch({ type: 'updateSettings', patch: { barKg: v } })}
            step={2.5}
            min={5}
            max={30}
            suffix="kg"
          />
          <p className="hint">Standard Olympic bar is 20kg. Women's bars are 15kg, studio bars often 10kg.</p>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Plates available (per side)</label>
          <div className="choices choices--3">
            {[25, 20, 15, 10, 5, 2.5, 1.25].map((p) => {
              const on = state.settings.plates.includes(p);
              return (
                <button
                  key={p}
                  className="choice choice--center"
                  aria-pressed={on}
                  onClick={() =>
                    dispatch({
                      type: 'updateSettings',
                      patch: {
                        plates: on
                          ? state.settings.plates.filter((x) => x !== p)
                          : [...state.settings.plates, p].sort((a, b) => b - a),
                      },
                    })
                  }
                >
                  <div className="choice-title num">{p}kg</div>
                </button>
              );
            })}
          </div>
          <p className="hint">Turn off what your gym doesn't have — the plate calculator uses this.</p>
        </div>
      </Card>

      <div className="section-title"><h2 style={{ margin: 0 }}>Rest timer</h2></div>
      <Card>
        <div className="field">
          <label>Between heavy sets</label>
          <Stepper
            value={state.settings.restSecMain}
            onChange={(v) => dispatch({ type: 'updateSettings', patch: { restSecMain: v } })}
            step={30}
            min={60}
            max={420}
            suffix="sec"
          />
        </div>
        <div className="field">
          <label>Between accessory sets</label>
          <Stepper
            value={state.settings.restSecAccessory}
            onChange={(v) => dispatch({ type: 'updateSettings', patch: { restSecAccessory: v } })}
            step={15}
            min={30}
            max={240}
            suffix="sec"
          />
        </div>
        <div className="row">
          <span>Beep when rest is up</span>
          <button
            className="choice"
            style={{ width: 'auto', padding: '8px 16px' }}
            aria-pressed={state.settings.sound}
            onClick={() => dispatch({ type: 'updateSettings', patch: { sound: !state.settings.sound } })}
          >
            {state.settings.sound ? 'On' : 'Off'}
          </button>
        </div>
      </Card>

      <div className="section-title"><h2 style={{ margin: 0 }}>How your targets are set</h2></div>
      <Card>
        <p className="small muted">
          Your strength targets are not a generic chart — they are computed from your body and age.
        </p>
        <details>
          <summary style={{ fontWeight: 650, cursor: 'pointer', fontSize: 14.5 }}>Show the derivation</summary>
          <ul className="notelist" style={{ marginTop: 12 }}>
            <li>
              <strong>Level.</strong> Novice one-rep-max standards as a multiple of bodyweight, from
              aggregate lifting-standards tables — squat 1.25×, bench 0.75×, deadlift 1.5×, press 0.55×
              for a 90kg man. "Novice" means three to six months of consistent training.
            </li>
            <li>
              <strong>Size.</strong> Strength tracks muscle cross-section, which scales as mass to the
              two-thirds power — the same law behind the Wilks and DOTS formulas. Applied to your
              estimated lean mass, so your height counts rather than the scale alone.
            </li>
            <li>
              <strong>Age.</strong> The Foster (under 24) and McCulloch (40+) age-grading coefficients
              used in masters powerlifting, inverted. Ages 24–39 are peak, with no adjustment.
            </li>
            <li>
              <strong>Sex.</strong> Published tables put women at about 75–85% of men on lower-body
              lifts and 60–70% on upper body. Lean mass explains part of that; the rest is applied on top.
            </li>
            <li>
              Lifts without a published standard — rows, machines, dumbbell work — are estimated as a
              share of a lift that has one. Those fractions are our judgement, not published figures.
            </li>
          </ul>
          <p className="small muted" style={{ marginTop: 10 }}>
            These are population averages, and none of it knows about your injuries, sleep or how a set
            actually felt. Every weight has ± buttons for exactly that reason.
          </p>
        </details>
      </Card>

      <div className="section-title"><h2 style={{ margin: 0 }}>Your data</h2></div>
      <Card>
        <p className="small muted">
          Everything lives on this device only — nothing is uploaded anywhere. Clearing your browser data
          will wipe it, so export a backup if you care about the history.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={exportData}>Export</button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Import
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importData(f);
              }}
            />
          </label>
        </div>
        <button
          className="btn btn--ghost btn--danger btn--block"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (confirm('Erase your profile, program and all logged sessions? This cannot be undone.')) {
              localStorage.removeItem(STORAGE_KEY);
              dispatch({ type: 'reset' });
            }
          }}
        >
          Erase everything
        </button>
      </Card>

      {editBody && (
        <Sheet onClose={() => setEditBody(false)}>
          <h2>Update measurements</h2>
          <p className="small muted">
            Changing these updates your lean-mass estimate and your strength targets. Your current working
            weights stay exactly where they are.
          </p>
          <div className="field">
            <label>Height</label>
            <Stepper value={height} onChange={setHeight} min={130} max={220} suffix="cm" />
          </div>
          <div className="field">
            <label>Bodyweight</label>
            <Stepper value={weight} onChange={setWeight} step={0.1} min={35} max={250} suffix="kg" />
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => setEditBody(false)}>Cancel</button>
            <button
              className="btn btn--primary"
              onClick={() => {
                dispatch({ type: 'updateProfile', patch: { heightCm: height } });
                if (weight !== profile.bodyweightKg) dispatch({ type: 'logBodyweight', kg: weight });
                setEditBody(false);
              }}
            >
              Save
            </button>
          </div>
        </Sheet>
      )}

      {switching && (
        <Sheet onClose={() => setSwitching(false)}>
          <h2>Switch program</h2>
          <p className="small muted">
            Lifts you're already training keep their weight. New lifts start from your body-based estimate.
          </p>
          <div className="stack">
            {PROGRAMS.map((p) => {
              const current = p.id === state.programId;
              const blocked = p.requires.includes('barbell') && !profile.hasRack;
              return (
                <button
                  key={p.id}
                  className="choice"
                  aria-pressed={current}
                  disabled={blocked}
                  style={blocked ? { opacity: 0.45 } : undefined}
                  onClick={() => {
                    if (current) return;
                    if (confirm(`Switch to ${p.name}?`)) {
                      dispatch({ type: 'switchProgram', programId: p.id });
                      setSwitching(false);
                    }
                  }}
                >
                  <div className="choice-title">
                    {p.name} {current ? '· current' : ''}
                  </div>
                  <div className="choice-sub">
                    {blocked ? 'Needs a squat rack — turn that on below' : p.tagline}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="divider" />
          <div className="row">
            <span className="small">My gym has a squat rack</span>
            <button
              className="choice"
              style={{ width: 'auto', padding: '8px 16px' }}
              aria-pressed={profile.hasRack}
              onClick={() => dispatch({ type: 'updateProfile', patch: { hasRack: !profile.hasRack } })}
            >
              {profile.hasRack ? 'Yes' : 'No'}
            </button>
          </div>
          <button className="btn btn--block" style={{ marginTop: 16 }} onClick={() => setSwitching(false)}>
            Close
          </button>
        </Sheet>
      )}

      <p className="small muted" style={{ textAlign: 'center', marginTop: 24 }}>
        Ironpath v1.0 · {Object.keys(state.lifts).length} lifts tracked
      </p>
    </div>
  );
}
