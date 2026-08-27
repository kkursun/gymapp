import { useState } from 'react';
import { getExercise } from '../data/exercises';
import { getProgram } from '../data/programs';
import { fmt } from '../engine/progression';
import { useStore } from '../store/StoreContext';
import { Card, Empty, Pill, Sheet, Stepper } from '../components/ui';
import { isTimed } from '../components/LiftEntry';
import type { Session } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function History() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ session: Session; exerciseIndex: number } | null>(null);

  if (state.sessions.length === 0) {
    return (
      <div className="screen">
        <h1>History</h1>
        <Empty icon="📓" title="No sessions yet" body="Everything you log shows up here, newest first." />
      </div>
    );
  }

  return (
    <div className="screen">
      <h1>History</h1>
      <p className="muted small">{state.sessions.length} sessions logged.</p>

      {state.sessions.map((session) => {
        const program = getProgram(session.programId);
        const day = program.days.find((d) => d.id === session.dayId);
        const expanded = open === session.id;
        const ups = session.exercises.filter((e) => e.outcome === 'progressed').length;
        return (
          <Card key={session.id}>
            <button
              className="row"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => setOpen(expanded ? null : session.id)}
              aria-expanded={expanded}
            >
              <div>
                <div style={{ fontWeight: 650 }}>
                  {session.kind === 'extra' ? 'Extra lifts' : `${day?.name ?? session.dayId} · ${program.name}`}
                </div>
                <div className="small muted num">
                  {formatDate(session.date)}
                  {session.kind === 'extra' ? '' : ` · ${Math.round(session.durationSec / 60)} min`}
                </div>
              </div>
              {session.kind === 'extra' ? (
                <Pill>extra</Pill>
              ) : ups > 0 ? (
                <Pill tone="good">{ups} up</Pill>
              ) : (
                <Pill>logged</Pill>
              )}
            </button>

            {expanded && (
              <>
                <div className="divider" />
                {session.exercises.map((ex, exerciseIndex) => (
                  <button
                    className="liftrow liftrow--tappable"
                    key={`${ex.exerciseId}-${exerciseIndex}`}
                    onClick={() => ex.outcome !== 'skipped' && setEditing({ session, exerciseIndex })}
                    disabled={ex.outcome === 'skipped'}
                  >
                    <div className="lift-name">
                      <div>
                        {getExercise(ex.exerciseId).name}
                        {ex.adhoc ? <span className="tag">added</span> : null}
                      </div>
                      <div className="small muted num">
                        {ex.outcome === 'skipped'
                          ? 'skipped'
                          : `${fmt(ex.weight)}kg · ${ex.sets.map((s) => s.reps).join(' · ')}`}
                      </div>
                    </div>
                    <Pill
                      tone={ex.outcome === 'progressed' ? 'good' : ex.outcome === 'deloaded' ? 'warn' : undefined}
                    >
                      {ex.outcome}
                    </Pill>
                  </button>
                ))}
                <p className="small muted" style={{ marginTop: 10 }}>Tap a lift to correct its reps.</p>
                <button
                  className="btn btn--ghost btn--danger btn--block small"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    if (confirm('Delete this session? Your lift weights will not be recalculated.')) {
                      dispatch({ type: 'deleteSession', id: session.id });
                    }
                  }}
                >
                  Delete session
                </button>
              </>
            )}
          </Card>
        );
      })}

      {editing && (
        <LoggedRepsEditor
          session={editing.session}
          exerciseIndex={editing.exerciseIndex}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Correct what was actually logged, after the fact. Records only: the weights the app
 * has already decided are not recomputed from history, the same rule the delete button
 * states, so a correction here fixes the log rather than rewriting the programme.
 */
function LoggedRepsEditor({
  session,
  exerciseIndex,
  onClose,
}: {
  session: Session;
  exerciseIndex: number;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  // Read through the store so the steppers show edits as they are made.
  const live = state.sessions.find((s) => s.id === session.id) ?? session;
  const ex = live.exercises[exerciseIndex];
  const meta = getExercise(ex.exerciseId);
  const timed = isTimed(ex.exerciseId);

  return (
    <Sheet onClose={onClose}>
      <h2>{meta.name}</h2>
      <p className="small muted">
        {formatDate(live.date)} · {ex.outcome === 'skipped' ? 'skipped' : `${fmt(ex.weight)}kg`}
      </p>
      <div className="stack">
        {ex.sets.map((set, setIndex) => (
          <div key={setIndex}>
            <div className="tiny">
              Set {setIndex + 1}
              {set.manual ? ' · added' : ''} · target {set.targetReps}
            </div>
            <Stepper
              value={set.reps}
              onChange={(reps) =>
                dispatch({ type: 'editLoggedSet', sessionId: live.id, exerciseIndex, setIndex, reps })
              }
              step={timed ? 5 : 1}
              min={0}
              max={600}
              suffix={timed ? 'sec' : 'reps'}
            />
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Corrections fix the record. Your working weights were already decided from what you
        logged at the time and are not recalculated.
      </p>
      <button className="btn btn--block" style={{ marginTop: 12 }} onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
