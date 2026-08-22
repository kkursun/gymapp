import { useEffect, useMemo, useState } from 'react';
import { getExercise } from '../data/exercises';
import { getProgram } from '../data/programs';
import { groupPlates, platesFor } from '../engine/plates';
import { applyProgression, fmt, isSessionSuccessful } from '../engine/progression';
import { substitutesForSlot } from '../engine/substitution';
import { WARMUP_REST_SEC } from '../engine/warmup';
import { snapperFor, useSlotScheme } from '../store/selectors';
import { useStore } from '../store/StoreContext';
import { Card, Pill, Sheet } from '../components/ui';
import { RestTimer } from '../components/RestTimer';
import type { LoggedSet } from '../types';

function setClass(set: LoggedSet): string {
  if (!set.completed) return 'setbtn';
  if (set.reps >= set.targetReps) return 'setbtn setbtn--done';
  return 'setbtn setbtn--partial';
}

export function Workout({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useStore();
  const active = state.active!;
  const program = getProgram(active.programId);
  const day = program.days.find((d) => d.id === active.dayId)!;
  const schemeFor = useSlotScheme(day);
  const [startedAt] = useState(() => +new Date(active.startedAt));
  const [rest, setRest] = useState<{ seconds: number; key: number } | null>(null);
  const [editing, setEditing] = useState<{ ex: number; set: number } | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // Keep the screen awake mid-workout where the browser allows it.
  useEffect(() => {
    let lock: any = null;
    const request = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request('screen');
      } catch {
        // Denied or unsupported — harmless.
      }
    };
    request();
    return () => lock?.release?.();
  }, []);

  const allLogged = active.exercises.every(
    (ex) => ex.outcome === 'skipped' || ex.sets.every((s) => s.completed),
  );

  /** Heavy compounds need longer between sets than curls do. */
  const startRest = (exerciseId: string) => {
    const meta = getExercise(exerciseId);
    const seconds =
      meta.loadType === 'accessory' || meta.loadType === 'bodyweight'
        ? state.settings.restSecAccessory
        : state.settings.restSecMain;
    setRest({ seconds, key: Date.now() });
  };

  const tapSet = (exIndex: number, setIndex: number) => {
    const set = active.exercises[exIndex].sets[setIndex];
    dispatch({ type: 'toggleSet', exerciseIndex: exIndex, setIndex });
    // Un-ticking a set is a correction, not a set just finished — no rest for that.
    if (!set.completed) startRest(active.exercises[exIndex].exerciseId);
  };

  const tapWarmup = (exIndex: number, setIndex: number) => {
    const set = active.exercises[exIndex].warmups?.[setIndex];
    dispatch({ type: 'toggleWarmup', exerciseIndex: exIndex, setIndex });
    // A ramp-up set earns a short breather, not a full three minutes.
    if (set && !set.completed) setRest({ seconds: WARMUP_REST_SEC, key: Date.now() });
  };

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 16 }}>
        <div>
          <div className="tiny">{program.name}</div>
          <h1 style={{ marginBottom: 0 }}>{day.name}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tiny">Elapsed</div>
          <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
            {mm}:{ss}
          </div>
        </div>
      </div>

      <Card variant="flush">
        {active.exercises.map((ex, exIndex) => {
          const meta = getExercise(ex.exerciseId);
          const scheme = schemeFor(ex);
          const done = ex.sets.every((s) => s.completed);
          const isTime = meta.unit === 'seconds';
          const load =
            meta.equipment === 'barbell' ? platesFor(ex.weight, state.settings.barKg, state.settings.plates) : null;
          const nextSet = ex.sets.findIndex((s) => !s.completed);
          const warmups = ex.warmups ?? [];

          return (
            <div
              className={`exercise${ex.outcome === 'skipped' ? ' exercise--skipped' : done ? ' exercise--done' : ''}`}
              key={ex.exerciseId}
            >
              <div className="exercise-head">
                <div>
                  <div className="exercise-name">{meta.name}</div>
                  <div className="exercise-target num">
                    {scheme.sets} × {ex.sets[0]?.targetReps ?? scheme.reps}
                    {isTime ? ' sec' : ''}
                    {meta.loadType !== 'bodyweight' ? ` @ ${fmt(ex.weight)}kg` : ''}
                    {meta.equipment === 'dumbbell' ? ' each' : ''}
                  </div>
                  {ex.sourceExerciseId && (
                    <div className="small muted">
                      swapped in for {getExercise(ex.sourceExerciseId).name}
                    </div>
                  )}
                </div>
                {meta.loadType !== 'bodyweight' && ex.outcome !== 'skipped' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn"
                      style={{ padding: '6px 12px' }}
                      onClick={() => dispatch({ type: 'adjustWeight', exerciseIndex: exIndex, delta: -meta.increment })}
                      aria-label={`Reduce ${meta.name} weight`}
                    >
                      −
                    </button>
                    <button
                      className="btn"
                      style={{ padding: '6px 12px' }}
                      onClick={() => dispatch({ type: 'adjustWeight', exerciseIndex: exIndex, delta: meta.increment })}
                      aria-label={`Increase ${meta.name} weight`}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              {load && load.perSide.length > 0 && (
                <div className="plates">
                  <span className="small muted">Per side:</span>
                  {groupPlates(load.perSide).map((g, i) => (
                    <span className="plate-chip" key={`${g.plate}-${i}`}>
                      {g.count} × {fmt(g.plate)}kg
                    </span>
                  ))}
                  {load.remainder > 0 && <span className="plate-chip">+{fmt(load.remainder)}kg short</span>}
                </div>
              )}

              {ex.outcome === 'skipped' ? (
                <div className="row" style={{ marginTop: 10 }}>
                  <span className="small muted">Skipped this session.</span>
                  <button
                    className="btn btn--ghost small"
                    style={{ padding: '6px 10px' }}
                    onClick={() => dispatch({ type: 'unskipExercise', exerciseIndex: exIndex })}
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <>
                  {warmups.length > 0 && (
                    <div className="warmup">
                      <div className="row" style={{ marginBottom: 6 }}>
                        <span className="tiny">Warm-up</span>
                        <span className="small muted">not counted</span>
                      </div>
                      <div className="setgrid">
                        {warmups.map((set, setIndex) => (
                          <button
                            key={setIndex}
                            className={`setbtn setbtn--warmup${set.completed ? ' setbtn--done' : ''}`}
                            onClick={() => tapWarmup(exIndex, setIndex)}
                            aria-label={`Warm-up set ${setIndex + 1}, ${fmt(set.weight)}kg for ${set.reps} ${
                              isTime ? 'seconds' : 'reps'
                            }${set.completed ? ', done' : ''}`}
                          >
                            <span className="num">{fmt(set.weight)}</span>
                            <span className="setbtn-sub">×{set.reps}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="setgrid">
                    {ex.sets.map((set, setIndex) => (
                      <button
                        key={setIndex}
                        className={`${setClass(set)}${setIndex === nextSet ? ' setbtn--active' : ''}`}
                        onClick={() => tapSet(exIndex, setIndex)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setEditing({ ex: exIndex, set: setIndex });
                        }}
                        aria-label={`Set ${setIndex + 1}, ${set.completed ? `${set.reps} reps done` : 'not done'}`}
                      >
                        {set.completed ? set.reps : set.targetReps}
                      </button>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn btn--ghost small"
                      style={{ padding: '6px 0' }}
                      onClick={() => setEditing({ ex: exIndex, set: Math.max(0, nextSet === -1 ? ex.sets.length - 1 : nextSet) })}
                    >
                      Missed reps?
                    </button>
                    <button
                      className="btn btn--ghost small"
                      style={{ padding: '6px 0' }}
                      onClick={() => setSwapping(exIndex)}
                    >
                      Swap
                    </button>
                    <button
                      className="btn btn--ghost small muted"
                      style={{ padding: '6px 0' }}
                      onClick={() => dispatch({ type: 'skipExercise', exerciseIndex: exIndex })}
                    >
                      Skip
                    </button>
                  </div>
                  <details style={{ marginTop: 8 }}>
                    <summary className="small muted" style={{ cursor: 'pointer' }}>How to do it</summary>
                    <ul className="notelist" style={{ marginTop: 8 }}>
                      {meta.cues.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </div>
          );
        })}
      </Card>

      <button
        className="btn btn--primary btn--block btn--lg"
        style={{ marginTop: 8 }}
        onClick={() => setSummary(true)}
      >
        {allLogged ? 'Finish session' : 'Finish early'}
      </button>
      <button
        className="btn btn--ghost btn--block small"
        style={{ marginTop: 8 }}
        onClick={() => {
          if (confirm('Discard this session? Nothing will be saved.')) {
            dispatch({ type: 'cancelSession' });
            onDone();
          }
        }}
      >
        Discard
      </button>

      {rest && (
        <RestTimer
          key={rest.key}
          seconds={rest.seconds}
          sound={state.settings.sound}
          onDismiss={() => setRest(null)}
        />
      )}

      {editing && (
        <RepEditor
          exerciseIndex={editing.ex}
          setIndex={editing.set}
          onLogged={startRest}
          onClose={() => setEditing(null)}
        />
      )}

      {swapping !== null && (
        <SwapSheet exerciseIndex={swapping} onClose={() => setSwapping(null)} />
      )}

      {summary && <SessionSummary onCancel={() => setSummary(false)} onConfirm={onDone} elapsed={elapsed} />}
    </div>
  );
}

/**
 * Swapping a lift out mid-session. The machine is occupied, or the gym does not own it —
 * either way the lifter needs an answer standing in front of the rack, not a settings
 * screen. Anything trained by the same movement pattern is offered.
 */
function SwapSheet({ exerciseIndex, onClose }: { exerciseIndex: number; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const active = state.active!;
  const target = active.exercises[exerciseIndex];
  const source = target.sourceExerciseId ?? target.exerciseId;
  const [permanent, setPermanent] = useState(false);

  const options = useMemo(
    () =>
      substitutesForSlot(
        source,
        state.profile!,
        // Never offer something already in this session: the log keys a day's lifts by
        // exercise, so the same lift twice cannot be recorded.
        active.exercises.map((e) => e.exerciseId).filter((id) => id !== target.exerciseId),
      ),
    [source, state.profile, active.exercises, target.exerciseId],
  );

  const snap = snapperFor(state);
  const swappedAway = target.exerciseId !== source;

  return (
    <Sheet onClose={onClose}>
      <h2>Swap {getExercise(source).name}</h2>
      <p className="small muted">
        Anything here trains the same movement, so your program still does its job. Your weight for
        the new lift is estimated from what you already lift.
      </p>

      <div className="stack">
        {swappedAway && (
          <button
            className="choice"
            onClick={() => {
              dispatch({
                type: 'substituteExercise',
                exerciseIndex,
                exerciseId: source,
                permanent: true,
              });
              onClose();
            }}
          >
            <div className="choice-title">{getExercise(source).name}</div>
            <div className="choice-sub">Put the original lift back</div>
          </button>
        )}
        {options.length === 0 && !swappedAway ? (
          <p className="small muted">
            Nothing in the exercise list trains this movement the same way. Use the ± buttons to
            adjust the weight instead, or skip it.
          </p>
        ) : (
          options.map((option) => {
            const lift = state.lifts[option.id];
            const weight = lift?.workingWeight ?? 0;
            return (
              <button
                key={option.id}
                className="choice"
                aria-pressed={option.id === target.exerciseId}
                onClick={() => {
                  dispatch({
                    type: 'substituteExercise',
                    exerciseIndex,
                    exerciseId: option.id,
                    permanent,
                  });
                  onClose();
                }}
              >
                <div className="choice-title">{option.name}</div>
                <div className="choice-sub">
                  {option.standard.kind === 'bodyweight'
                    ? 'Bodyweight'
                    : `${fmt(weight || snap(option.minLoad, option, 'up'))}kg${
                        lift ? '' : ' to start'
                      }`}
                  {option.equipment === 'dumbbell' ? ' each' : ''} · {option.cues[0]}
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="divider" />
      <div className="row">
        <div>
          <span className="small">Swap for every session</span>
          <div className="small muted">Leave off to change today only.</div>
        </div>
        <button
          className="choice"
          style={{ width: 'auto', padding: '8px 16px' }}
          aria-pressed={permanent}
          onClick={() => setPermanent((p) => !p)}
        >
          {permanent ? 'On' : 'Off'}
        </button>
      </div>

      <button className="btn btn--block" style={{ marginTop: 16 }} onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

function RepEditor({
  exerciseIndex,
  setIndex,
  onLogged,
  onClose,
}: {
  exerciseIndex: number;
  setIndex: number;
  onLogged: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const ex = state.active!.exercises[exerciseIndex];
  const meta = getExercise(ex.exerciseId);
  const set = ex.sets[setIndex];
  const isTime = meta.unit === 'seconds';
  const options = isTime
    ? [0, 10, 15, 20, 25, 30, 40, 45, 60, 75, 90]
    : Array.from({ length: set.targetReps + 4 }, (_, i) => i);

  return (
    <Sheet onClose={onClose}>
      <h2>{meta.name} — set {setIndex + 1}</h2>
      <p className="small muted">
        How many {isTime ? 'seconds' : 'reps'} did you actually get at {fmt(ex.weight)}kg? Target is{' '}
        {set.targetReps}.
      </p>
      <div className="setgrid">
        {options.map((n) => (
          <button
            key={n}
            className={`setbtn${n === set.reps && set.completed ? ' setbtn--active' : ''}`}
            onClick={() => {
              dispatch({ type: 'setReps', exerciseIndex, setIndex, reps: n });
              // Logging a short set still finishes a set, so it still starts the rest.
              onLogged(ex.exerciseId);
              onClose();
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <button className="btn btn--block" style={{ marginTop: 16 }} onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

function SessionSummary({
  onCancel,
  onConfirm,
  elapsed,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  elapsed: number;
}) {
  const { state, dispatch } = useStore();
  const active = state.active!;
  const day = getProgram(active.programId).days.find((d) => d.id === active.dayId)!;
  const schemeFor = useSlotScheme(day);
  const [notes, setNotes] = useState('');

  // Preview exactly what finishing will do to each lift, using the same engine.
  const preview = active.exercises.map((ex) => {
    const meta = getExercise(ex.exerciseId);
    const performed = ex.sets.filter((s) => s.completed);
    const lift = state.lifts[ex.exerciseId];
    if (ex.outcome === 'skipped' || performed.length === 0 || !lift) {
      return { name: meta.name, message: 'Not logged — no change.', tone: undefined as 'good' | 'warn' | undefined };
    }
    const result = applyProgression(
      { ...lift, workingWeight: ex.weight },
      performed,
      schemeFor(ex),
      snapperFor(state),
    );
    return {
      name: meta.name,
      message: result.message,
      tone: result.outcome === 'progressed' ? ('good' as const) : result.outcome === 'deloaded' ? ('warn' as const) : undefined,
    };
  });

  const wins = active.exercises.filter(
    (ex) => ex.outcome !== 'skipped' && ex.sets.some((s) => s.completed) && isSessionSuccessful(ex.sets.filter((s) => s.completed)),
  ).length;

  return (
    <Sheet onClose={onCancel}>
      <h2>Session done</h2>
      <p className="small muted">
        {Math.round(elapsed / 60)} minutes · {wins} of {active.exercises.length} lifts moving up.
      </p>
      <div className="stack">
        {preview.map((p) => (
          <div key={p.name}>
            <div className="row">
              <strong style={{ fontSize: 15 }}>{p.name}</strong>
              {p.tone ? <Pill tone={p.tone}>{p.tone === 'good' ? 'up' : 'deload'}</Pill> : null}
            </div>
            <div className="small muted">{p.message}</div>
          </div>
        ))}
      </div>
      <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
        <label htmlFor="session-notes">Notes</label>
        <textarea
          id="session-notes"
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How it felt, a niggle, anything worth remembering. Optional."
        />
      </div>
      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="btn" onClick={onCancel}>Back</button>
        <button
          className="btn btn--primary"
          onClick={() => {
            dispatch({ type: 'finishSession', durationSec: elapsed, notes });
            onConfirm();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
