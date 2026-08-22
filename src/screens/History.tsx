import { useState } from 'react';
import { getExercise } from '../data/exercises';
import { getProgram } from '../data/programs';
import { fmt } from '../engine/progression';
import { useStore } from '../store/StoreContext';
import { Card, Empty, Pill } from '../components/ui';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function History() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState<string | null>(null);

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
                  {day?.name ?? session.dayId} · {program.name}
                </div>
                <div className="small muted num">
                  {formatDate(session.date)} · {Math.round(session.durationSec / 60)} min
                </div>
              </div>
              {ups > 0 ? <Pill tone="good">{ups} up</Pill> : <Pill>logged</Pill>}
            </button>

            {expanded && (
              <>
                <div className="divider" />
                {session.exercises.map((ex) => (
                  <div className="liftrow" key={ex.exerciseId}>
                    <div className="lift-name">
                      <div>{getExercise(ex.exerciseId).name}</div>
                      <div className="small muted num">
                        {ex.outcome === 'skipped'
                          ? 'skipped'
                          : `${fmt(ex.weight)}kg · ${ex.sets.map((s) => s.reps).join(' · ')}`}
                      </div>
                      {ex.sourceExerciseId && (
                        <div className="small muted">
                          swapped in for {getExercise(ex.sourceExerciseId).name}
                        </div>
                      )}
                    </div>
                    <Pill
                      tone={ex.outcome === 'progressed' ? 'good' : ex.outcome === 'deloaded' ? 'warn' : undefined}
                    >
                      {ex.outcome}
                    </Pill>
                  </div>
                ))}
                {session.notes && (
                  <div className="notebox">
                    <div className="tiny">Notes</div>
                    <p className="small" style={{ margin: '4px 0 0' }}>{session.notes}</p>
                  </div>
                )}
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
    </div>
  );
}
