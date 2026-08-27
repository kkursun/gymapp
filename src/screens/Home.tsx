import { useMemo, useState } from 'react';
import { getExercise } from '../data/exercises';
import { getProgram } from '../data/programs';
import { checkPromotion } from '../engine/graduation';
import { describeReps, fmt } from '../engine/progression';
import { platesFor, groupPlates } from '../engine/plates';
import { currentDay } from '../store/state';
import { useStore } from '../store/StoreContext';
import { Card, Pill } from '../components/ui';
import { CheckInCard } from '../components/CheckInCard';
import { LiftEntrySheet } from '../components/LiftEntry';

function daysAgo(iso: string): string {
  const diff = Math.floor((Date.now() - +new Date(iso)) / 86400000);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  return `${diff} days ago`;
}

/** Program sessions in the last 7 days vs. the program's target. */
function weeklyCount(dates: string[]): number {
  const cutoff = Date.now() - 7 * 86400000;
  return dates.filter((d) => +new Date(d) >= cutoff).length;
}

export function Home({ onPromotion }: { onPromotion: () => void }) {
  const { state, dispatch } = useStore();
  const profile = state.profile!;
  const program = getProgram(state.programId!);
  const day = currentDay(state)!;
  const promotion = useMemo(() => checkPromotion(state), [state]);

  const [logExtra, setLogExtra] = useState(false);
  // Extra lifts are training, but they are not one of the program's sessions.
  const thisWeek = weeklyCount(state.sessions.filter((s) => s.kind !== 'extra').map((s) => s.date));
  const last = state.sessions[0];
  // The "last session" card is about the rotation, so an extra lift is not one.
  const lastProgram = state.sessions.find((s) => s.kind !== 'extra');

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 18 }}>
        <div>
          <div className="tiny">{program.name}</div>
          <h1>{profile.name === 'Lifter' ? 'Ready to lift' : `Hi, ${profile.name}`}</h1>
        </div>
        <Pill tone={thisWeek >= program.daysPerWeek ? 'good' : undefined}>
          {thisWeek}/{program.daysPerWeek} this week
        </Pill>
      </div>

      <CheckInCard />

      {promotion && (
        <Card variant="accent">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2 style={{ margin: 0 }}>{promotion.headline}</h2>
            <Pill tone="accent">Upgrade</Pill>
          </div>
          <p className="small muted">{promotion.reasons[0]}</p>
          <button className="btn btn--primary btn--block" onClick={onPromotion}>
            See what changes
          </button>
        </Card>
      )}

      <Card variant="good">
        <div className="row" style={{ marginBottom: 4 }}>
          <div className="tiny">Next session</div>
          {last ? <span className="small muted">last {daysAgo(last.date)}</span> : null}
        </div>
        <h2 style={{ marginBottom: 12 }}>{day.name}</h2>

        {day.slots.map((slot) => {
          const ex = getExercise(slot.exerciseId);
          const lift = state.lifts[slot.exerciseId];
          const weight = lift?.workingWeight ?? 0;
          const load =
            ex.equipment === 'barbell'
              ? platesFor(weight, state.settings.barKg, state.settings.plates)
              : null;
          return (
            <div className="liftrow" key={slot.exerciseId}>
              <div className="lift-name">
                <div>{ex.name}</div>
                <div className="small muted num">
                  {slot.scheme.sets} × {describeReps(slot.scheme, lift?.workingReps)}
                  {ex.loadType === 'bodyweight' ? (slot.exerciseId === 'plank' ? ' sec' : ' reps') : ''}
                  {load && load.perSide.length > 0
                    ? ` · ${groupPlates(load.perSide)
                        .map((g) => (g.count > 1 ? `${g.count}×${fmt(g.plate)}` : fmt(g.plate)))
                        .join(' + ')}kg a side`
                    : ''}
                </div>
              </div>
              <div className="lift-weight num">
                {ex.loadType === 'bodyweight' ? '—' : `${fmt(weight)}kg`}
                {lift && lift.consecutiveFailures > 0 ? (
                  <div className="small" style={{ color: 'var(--warn)', fontWeight: 500 }}>
                    retry
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <button className="btn btn--primary btn--block btn--lg" style={{ marginTop: 16 }} onClick={() => dispatch({ type: 'startSession' })}>
          Start {day.name}
        </button>
        <button
          className="btn btn--ghost btn--block small"
          style={{ marginTop: 8 }}
          onClick={() => {
            if (confirm(`Skip ${day.name} and move to the next session?`)) dispatch({ type: 'skipDay' });
          }}
        >
          Skip this day
        </button>
      </Card>

      <Card>
        <div className="row">
          <div>
            <div style={{ fontWeight: 650 }}>Did something else?</div>
            <div className="small muted">
              Log a lift you did outside the program. It goes in your history and your
              records, and leaves the rotation where it is.
            </div>
          </div>
        </div>
        <button className="btn btn--block" style={{ marginTop: 12 }} onClick={() => setLogExtra(true)}>
          + Log an extra lift
        </button>
      </Card>

      <div className="section-title">
        <h2 style={{ margin: 0 }}>Your week</h2>
        <span className="small muted">{program.daysPerWeek} sessions, in order</span>
      </div>
      <Card>
        <p className="small muted">
          The rotation repeats. Every lift in the program is here — if one is not in your next
          session, it comes round on the day shown.
        </p>
        {program.days.map((d, i) => {
          const upcoming = d.id === day.id;
          // How many sessions until this day comes round again.
          const offset = (i - (state.dayCursor % program.days.length) + program.days.length) % program.days.length;
          return (
            <div className="liftrow" key={d.id}>
              <div className="lift-name">
                <div style={{ fontWeight: upcoming ? 700 : 500 }}>{d.name}</div>
                <div className="small muted">
                  {d.slots.map((slot) => getExercise(slot.exerciseId).name).join(' · ')}
                </div>
              </div>
              {upcoming ? (
                <Pill tone="accent">next</Pill>
              ) : (
                <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                  in {offset}
                </span>
              )}
            </div>
          );
        })}
      </Card>

      {logExtra && (
        <LiftEntrySheet
          title="Log an extra lift"
          intro="Something you did outside the program — pick the lift and say what you managed."
          confirmLabel="Log it"
          onConfirm={(entry) => dispatch({ type: 'logExtraLift', ...entry })}
          onClose={() => setLogExtra(false)}
        />
      )}

      {lastProgram && (
        <>
          <div className="section-title">
            <h2 style={{ margin: 0 }}>Last session</h2>
            <span className="small muted">{daysAgo(lastProgram.date)}</span>
          </div>
          <Card>
            {lastProgram.exercises.map((ex, i) => {
              const meta = getExercise(ex.exerciseId);
              const tone =
                ex.outcome === 'progressed' ? 'good' : ex.outcome === 'deloaded' ? 'warn' : undefined;
              return (
                <div className="liftrow" key={`${ex.exerciseId}-${i}`}>
                  <div className="lift-name">
                    <div>{meta.name}</div>
                    <div className="small muted num">
                      {ex.sets.map((s) => s.reps).join(' · ') || '—'}
                    </div>
                  </div>
                  <Pill tone={tone}>
                    {ex.outcome === 'progressed'
                      ? `→ ${fmt(ex.nextWeight)}kg`
                      : ex.outcome === 'deloaded'
                        ? `↓ ${fmt(ex.nextWeight)}kg`
                        : ex.outcome === 'skipped'
                          ? 'skipped'
                          : 'repeat'}
                  </Pill>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
