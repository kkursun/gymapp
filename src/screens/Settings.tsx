import { useMemo, useState } from 'react';
import { getProgram, PROGRAMS } from '../data/programs';
import { getExercise } from '../data/exercises';
import { readBody } from '../engine/body';
import { fmt } from '../engine/progression';
import { programExerciseIds, substitutesFor } from '../engine/substitution';
import { useStore } from '../store/StoreContext';
import { Card, Pill, Sheet, Stepper } from '../components/ui';
import { migrate, STORAGE_KEY } from '../store/state';

export function Settings() {
  const { state, dispatch } = useStore();
  const profile = state.profile!;
  const body = readBody(profile);
  const [switching, setSwitching] = useState(false);
  const [swaps, setSwaps] = useState(false);
  const [editBody, setEditBody] = useState(false);
  const [height, setHeight] = useState(profile.heightCm);
  const [weight, setWeight] = useState(profile.bodyweightKg);

  const substitutionCount = Object.keys(state.substitutions).length;

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
        // Validate the shape and run it through the same migrations as stored state,
        // rather than dropping whatever the file happens to contain into the reducer.
        const restored = migrate(JSON.parse(text));
        if (!restored) {
          throw new Error(
            'this is not an Ironpath backup, or it was written by a newer version of the app',
          );
        }
        dispatch({ type: 'import', state: restored });
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

      <div className="section-title">
        <h2 style={{ margin: 0 }}>Exercise swaps</h2>
        {substitutionCount > 0 ? <Pill tone="accent">{substitutionCount}</Pill> : null}
      </div>
      <Card>
        <p className="small muted">
          If your gym does not have something, swap it for a lift that trains the same movement.
          Your program keeps working — only the exercise changes.
        </p>
        <button className="btn btn--block" onClick={() => setSwaps(true)}>
          {substitutionCount > 0 ? 'Manage swaps' : 'Swap an exercise'}
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

      <div className="section-title"><h2 style={{ margin: 0 }}>Warm-up sets</h2></div>
      <Card>
        <div className="row">
          <div style={{ paddingRight: 12 }}>
            <span className="small">Ramp up to the working weight</span>
            <p className="hint" style={{ margin: '4px 0 0' }}>
              A few progressively heavier sets before the sets that count, on the compound lifts
              only. They are never judged for progression — missing one is not a failed session.
            </p>
          </div>
          <button
            className="choice"
            style={{ width: 'auto', padding: '8px 16px', flexShrink: 0 }}
            aria-pressed={state.settings.warmups}
            onClick={() => dispatch({ type: 'updateSettings', patch: { warmups: !state.settings.warmups } })}
          >
            {state.settings.warmups ? 'On' : 'Off'}
          </button>
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
                // Stamping the measurement date is what stops the app asking for a height
                // it was just given.
                dispatch({
                  type: 'updateProfile',
                  patch: { heightCm: height, heightMeasuredAt: new Date().toISOString() },
                });
                if (weight !== profile.bodyweightKg) dispatch({ type: 'logBodyweight', kg: weight });
                setEditBody(false);
              }}
            >
              Save
            </button>
          </div>
        </Sheet>
      )}

      {swaps && <SwapManager onClose={() => setSwaps(false)} />}

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


/**
 * Permanent exercise swaps. The in-session version on the workout screen covers "the
 * machine is busy today"; this one covers "my gym does not own that", which needs to
 * stick across every future session.
 */
function SwapManager({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const profile = state.profile!;
  const program = getProgram(state.programId!);
  const [picking, setPicking] = useState<string | null>(null);

  // One row per lift the program prescribes, paired with whatever currently stands in.
  const rows = useMemo(() => {
    const prescribed = [
      ...new Set(program.days.flatMap((d) => d.slots.map((s) => s.exerciseId))),
    ];
    return prescribed.map((id) => ({ id, replacement: state.substitutions[id] }));
  }, [program, state.substitutions]);

  const options = useMemo(() => {
    if (!picking) return [];
    // Exclude everything else the program already trains, so a swap cannot put the same
    // lift into a day twice.
    const inUse = programExerciseIds(program, state.substitutions).filter(
      (id) => id !== (state.substitutions[picking] ?? picking),
    );
    return substitutesFor(picking, { hasRack: profile.hasRack, exclude: inUse });
  }, [picking, program, state.substitutions, profile.hasRack]);

  if (picking) {
    const current = state.substitutions[picking];
    return (
      <Sheet onClose={() => setPicking(null)}>
        <h2>Instead of {getExercise(picking).name}</h2>
        <p className="small muted">
          Every option trains the same movement pattern. Your starting weight is estimated from
          what you already lift.
        </p>
        <div className="stack">
          {current && (
            <button
              className="choice"
              onClick={() => {
                dispatch({ type: 'restoreExercise', exerciseId: picking });
                setPicking(null);
              }}
            >
              <div className="choice-title">{getExercise(picking).name}</div>
              <div className="choice-sub">Go back to the prescribed lift</div>
            </button>
          )}
          {options.length === 0 ? (
            <p className="small muted">
              Nothing else in the exercise list trains this movement the same way.
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                className="choice"
                aria-pressed={option.id === current}
                onClick={() => {
                  dispatch({ type: 'setSubstitution', from: picking, to: option.id });
                  setPicking(null);
                }}
              >
                <div className="choice-title">{option.name}</div>
                <div className="choice-sub">{option.cues[0]}</div>
              </button>
            ))
          )}
        </div>
        <button className="btn btn--block" style={{ marginTop: 16 }} onClick={() => setPicking(null)}>
          Cancel
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <h2>Exercise swaps</h2>
      <p className="small muted">
        Tap a lift to replace it everywhere in {program.name}. Weights you have already built up
        stay with the lift they belong to, so undoing a swap loses nothing.
      </p>
      <div className="stack">
        {rows.map(({ id, replacement }) => (
          <button key={id} className="choice" onClick={() => setPicking(id)}>
            <div className="choice-title">
              {replacement ? getExercise(replacement).name : getExercise(id).name}
            </div>
            <div className="choice-sub">
              {replacement ? `instead of ${getExercise(id).name}` : 'as prescribed'}
            </div>
          </button>
        ))}
      </div>
      <button className="btn btn--block" style={{ marginTop: 16 }} onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
