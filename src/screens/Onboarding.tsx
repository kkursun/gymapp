import { useMemo, useState } from 'react';
import { getExercise } from '../data/exercises';
import { buildNotes, recommendProgram, startingWeight, targetFiveRepMax } from '../engine/starting';
import { readBody } from '../engine/body';
import { fmt } from '../engine/progression';
import { useStore } from '../store/StoreContext';
import type { Experience, Profile, Sex } from '../types';
import { Card, Pill, Stepper } from '../components/ui';

const STEPS = 5;

export function Onboarding() {
  const { dispatch } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState(28);
  const [heightCm, setHeightCm] = useState(178);
  const [bodyweightKg, setBodyweightKg] = useState(78);
  const [experience, setExperience] = useState<Experience>('never');
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [hasRack, setHasRack] = useState(true);
  const [chosenProgram, setChosenProgram] = useState<string | null>(null);

  const profile: Profile = useMemo(
    () => ({
      name: name.trim() || 'Lifter',
      sex,
      age,
      heightCm,
      bodyweightKg,
      experience,
      daysPerWeek,
      hasRack,
      createdAt: new Date().toISOString(),
    }),
    [name, sex, age, heightCm, bodyweightKg, experience, daysPerWeek, hasRack],
  );

  const recommendation = useMemo(() => recommendProgram(profile), [profile]);
  const programId = chosenProgram ?? recommendation.program.id;
  const program = [recommendation.program, ...recommendation.alternatives].find((p) => p.id === programId)!;
  const body = useMemo(() => readBody(profile), [profile]);
  const notes = useMemo(() => buildNotes(profile), [profile]);

  const mainLifts = useMemo(() => {
    const ids = new Set(program.days.flatMap((d) => d.slots.map((s) => s.exerciseId)));
    return [...ids]
      .map((id) => ({ ex: getExercise(id), start: startingWeight(profile, id), target: targetFiveRepMax(profile, id) }))
      .filter((l) => l.ex.lbmRatio > 0)
      .sort((a, b) => b.target - a.target);
  }, [program, profile]);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="screen screen--plain">
      <div className="progress-dots">
        {Array.from({ length: STEPS }, (_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>

      {step === 0 && (
        <>
          <h1>Let's build your program</h1>
          <p className="muted">
            Five questions. Your height and weight set your starting loads — then the app adds weight every
            time you finish a session, and pulls it back when you stall. You never have to decide what to
            lift or how much.
          </p>
          <div className="field">
            <label htmlFor="name">What should we call you?</label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              autoComplete="given-name"
            />
          </div>
          <button className="btn btn--primary btn--block btn--lg" onClick={next}>
            Start
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h1>About you</h1>
          <p className="muted small">
            Age and sex change how much muscle your frame carries, which is what your starting weights are
            calculated from.
          </p>
          <div className="field">
            <label>Sex</label>
            <div className="choices choices--2">
              {(['male', 'female'] as Sex[]).map((s) => (
                <button
                  key={s}
                  className="choice choice--center"
                  aria-pressed={sex === s}
                  onClick={() => setSex(s)}
                >
                  <div className="choice-title">{s === 'male' ? 'Male' : 'Female'}</div>
                </button>
              ))}
            </div>
            <p className="hint">Used only for the lean-mass formula that sets your starting weights.</p>
          </div>
          <div className="field">
            <label>Age</label>
            <Stepper value={age} onChange={setAge} min={14} max={90} suffix="years" />
          </div>
          <div className="btn-row">
            <button className="btn" onClick={back}>Back</button>
            <button className="btn btn--primary" onClick={next}>Next</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Height &amp; weight</h1>
          <p className="muted small">
            Two people who weigh the same but differ in height carry very different amounts of muscle. Both
            numbers together give a far better starting point than the scale alone.
          </p>
          <div className="field">
            <label>Height</label>
            <Stepper value={heightCm} onChange={setHeightCm} min={130} max={220} suffix="cm" />
          </div>
          <div className="field">
            <label>Bodyweight</label>
            <Stepper value={bodyweightKg} onChange={setBodyweightKg} step={0.5} min={35} max={200} suffix="kg" />
          </div>
          <Card>
            <div className="row">
              <div>
                <div className="tiny">Estimated lean mass</div>
                <div style={{ fontSize: 22, fontWeight: 700 }} className="num">{body.lbm.toFixed(1)} kg</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="tiny">BMI</div>
                <div style={{ fontSize: 22, fontWeight: 700 }} className="num">{body.bmi.toFixed(1)}</div>
              </div>
            </div>
          </Card>
          <div className="btn-row">
            <button className="btn" onClick={back}>Back</button>
            <button className="btn btn--primary" onClick={next}>Next</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Your experience</h1>
          <div className="field">
            <label>Have you lifted weights before?</label>
            <div className="choices">
              {[
                { id: 'never' as const, title: 'Never', sub: 'Or only tried it a handful of times' },
                { id: 'some' as const, title: 'A little', sub: 'A few months at some point' },
                { id: 'returning' as const, title: 'Coming back', sub: 'Trained properly before, took a break' },
              ].map((o) => (
                <button key={o.id} className="choice" aria-pressed={experience === o.id} onClick={() => setExperience(o.id)}>
                  <div className="choice-title">{o.title}</div>
                  <div className="choice-sub">{o.sub}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Days a week you can train</label>
            <div className="choices choices--3">
              {[2, 3, 4].map((d) => (
                <button key={d} className="choice choice--center" aria-pressed={daysPerWeek === d} onClick={() => setDaysPerWeek(d)}>
                  <div className="choice-title">{d} days</div>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Does your gym have a squat rack or power cage?</label>
            <div className="choices choices--2">
              <button className="choice choice--center" aria-pressed={hasRack} onClick={() => setHasRack(true)}>
                <div className="choice-title">Yes</div>
              </button>
              <button className="choice choice--center" aria-pressed={!hasRack} onClick={() => setHasRack(false)}>
                <div className="choice-title">No / not sure</div>
              </button>
            </div>
            <p className="hint">Without one, the barbell program isn't safe to run — we'll start you on machines instead.</p>
          </div>
          <div className="btn-row">
            <button className="btn" onClick={back}>Back</button>
            <button className="btn btn--primary" onClick={next}>See my plan</button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <h1>Your plan</h1>
          <Card variant="accent">
            <div className="row" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>{program.name}</h2>
              {program.id === recommendation.program.id ? <Pill tone="accent">Recommended</Pill> : null}
            </div>
            <div className="tiny" style={{ marginBottom: 10 }}>{program.tagline}</div>
            <p className="small muted" style={{ marginBottom: 0 }}>{program.description}</p>
          </Card>

          {program.id === recommendation.program.id && recommendation.reasons.length > 0 && (
            <Card>
              <h3>Why this one</h3>
              <ul className="notelist">
                {recommendation.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3>Your starting weights</h3>
            <p className="small muted">
              Light on purpose. The first weeks teach the movement — then the weight climbs every session.
            </p>
            {mainLifts.map(({ ex, start, target }) => (
              <div className="liftrow" key={ex.id}>
                <div className="lift-name">
                  <div>{ex.name}</div>
                  <div className="small muted num">
                    novice standard ≈ {fmt(Math.round(target))}kg × 5
                  </div>
                </div>
                <div className="lift-weight num">{fmt(start)}kg</div>
              </div>
            ))}
          </Card>

          <Card>
            <h3>Notes for your build</h3>
            <ul className="notelist">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Card>

          <details className="card">
            <summary style={{ fontWeight: 650, cursor: 'pointer' }}>Use a different program</summary>
            <div className="stack" style={{ marginTop: 14 }}>
              {[recommendation.program, ...recommendation.alternatives].map((p) => (
                <button key={p.id} className="choice" aria-pressed={p.id === programId} onClick={() => setChosenProgram(p.id)}>
                  <div className="choice-title">{p.name}</div>
                  <div className="choice-sub">{p.tagline}</div>
                </button>
              ))}
            </div>
          </details>

          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={back}>Back</button>
            <button
              className="btn btn--primary"
              onClick={() => dispatch({ type: 'onboard', profile, programId })}
            >
              Let's go
            </button>
          </div>
        </>
      )}
    </div>
  );
}
