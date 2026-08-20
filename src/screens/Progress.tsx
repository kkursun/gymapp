import { useMemo, useState } from 'react';
import { getExercise } from '../data/exercises';
import { getProgram } from '../data/programs';
import { describeStandardProgress, standardProgress } from '../engine/graduation';
import { targetFiveRepMax } from '../engine/starting';
import { fmt } from '../engine/progression';
import { readBody } from '../engine/body';
import { useStore } from '../store/StoreContext';
import { Card, Empty, Meter, Pill, Sheet, Stepper } from '../components/ui';
import { LineChart } from '../components/Chart';

const COLORS = ['#f26b3a', '#46c07a', '#5aa9e6', '#e5b445', '#b58ce8'];

export function Progress() {
  const { state, dispatch } = useStore();
  const profile = state.profile!;
  const program = getProgram(state.programId!);
  const body = useMemo(() => readBody(profile), [profile]);
  const [weighIn, setWeighIn] = useState(false);
  const [newWeight, setNewWeight] = useState(profile.bodyweightKg);

  const trackedIds = useMemo(() => {
    const ids = new Set(program.days.flatMap((d) => d.slots.map((s) => s.exerciseId)));
    return [...ids].filter((id) => getExercise(id).lbmRatio > 0);
  }, [program]);

  // One point per session per lift, oldest first.
  const strengthSeries = useMemo(() => {
    const ordered = [...state.sessions].reverse();
    return (
      trackedIds
        .map((id) => ({
          label: getExercise(id).name.replace(/^(Barbell|Dumbbell|Seated Cable) /, ''),
          points: ordered.flatMap((s, idx) => {
            const ex = s.exercises.find((e) => e.exerciseId === id && e.outcome !== 'skipped');
            return ex ? [{ x: idx, y: ex.weight }] : [];
          }),
        }))
        .filter((s) => s.points.length >= 2)
        // Colour after filtering, or lifts with no history burn palette slots and the
        // remaining lines end up sharing colours.
        .map((s, i) => ({ ...s, color: COLORS[i % COLORS.length] }))
    );
  }, [state.sessions, trackedIds]);

  const bodySeries = useMemo(
    () => [
      {
        label: 'Bodyweight',
        color: '#5aa9e6',
        points: state.bodyweightLog.map((e, i) => ({ x: i, y: e.kg })),
      },
    ],
    [state.bodyweightLog],
  );

  const standards = useMemo(() => standardProgress(state, profile), [state, profile]);

  const stalled = useMemo(
    () => Object.values(state.lifts).filter((l) => l.deloads > 0 || l.consecutiveFailures > 0),
    [state.lifts],
  );

  const totalVolume = state.sessions.reduce(
    (sum, s) => sum + s.exercises.reduce((v, ex) => v + ex.sets.reduce((n, set) => n + set.reps * set.weight, 0), 0),
    0,
  );

  if (state.sessions.length === 0) {
    return (
      <div className="screen">
        <h1>Progress</h1>
        <Empty icon="📈" title="Nothing to plot yet" body="Log your first session and your lifts start showing up here." />
      </div>
    );
  }

  return (
    <div className="screen">
      <h1>Progress</h1>

      <Card>
        <div className="row">
          <div>
            <div className="tiny">Sessions</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{state.sessions.length}</div>
          </div>
          <div>
            <div className="tiny">Total lifted</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>
              {(totalVolume / 1000).toFixed(1)}t
            </div>
          </div>
          <div>
            <div className="tiny">Lean mass</div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{body.lbm.toFixed(0)}kg</div>
          </div>
        </div>
      </Card>

      <div className="section-title">
        <h2 style={{ margin: 0 }}>Working weight</h2>
        <span className="small muted">by session</span>
      </div>
      <Card>
        <LineChart series={strengthSeries} format={(v) => `${Math.round(v)}`} />
      </Card>

      <div className="section-title">
        <h2 style={{ margin: 0 }}>Against novice standard</h2>
      </div>
      <Card>
        <p className="small muted">
          Scaled to your lean mass, not a generic chart. Clearing these is the point at which a beginner
          program has done its job.
        </p>
        {standards.map((s) => {
          const ex = getExercise(s.id);
          const target = targetFiveRepMax(profile, s.id);
          return (
            <div key={s.id} style={{ marginBottom: 14 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 14.5 }}>{ex.name}</span>
                <span className="small muted num">
                  {fmt(Math.max(state.lifts[s.id].bestWeight, state.lifts[s.id].workingWeight))} / {fmt(Math.round(target))}kg
                </span>
              </div>
              <Meter value={s.ratio} />
              <div className="small muted" style={{ marginTop: 4 }}>{describeStandardProgress(s.ratio)}</div>
            </div>
          );
        })}
      </Card>

      <div className="section-title">
        <h2 style={{ margin: 0 }}>Bodyweight</h2>
        <button className="btn btn--ghost small" style={{ padding: '4px 10px' }} onClick={() => setWeighIn(true)}>
          Log weigh-in
        </button>
      </div>
      <Card>
        <LineChart series={bodySeries} height={120} format={(v) => v.toFixed(1)} />
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Weighing in updates your lean-mass estimate, which moves your strength targets with you.
        </p>
      </Card>

      <div className="section-title">
        <h2 style={{ margin: 0 }}>Stalls &amp; deloads</h2>
      </div>
      <Card>
        {stalled.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            No stalls yet. Every lift is still going up.
          </p>
        ) : (
          stalled.map((l) => (
            <div className="liftrow" key={l.exerciseId}>
              <div className="lift-name">
                <div>{getExercise(l.exerciseId).name}</div>
                {l.lastStallWeight ? (
                  <div className="small muted num">stalled at {fmt(l.lastStallWeight)}kg</div>
                ) : null}
              </div>
              <Pill tone={l.deloads > 0 ? 'warn' : undefined}>
                {l.deloads > 0 ? `${l.deloads} deload${l.deloads > 1 ? 's' : ''}` : `${l.consecutiveFailures} miss`}
              </Pill>
            </div>
          ))
        )}
      </Card>

      {weighIn && (
        <Sheet onClose={() => setWeighIn(false)}>
          <h2>Weigh-in</h2>
          <p className="small muted">Weigh yourself at the same time of day for a number that means something.</p>
          <Stepper value={newWeight} onChange={setNewWeight} step={0.1} min={35} max={250} suffix="kg" />
          <div className="btn-row" style={{ marginTop: 20 }}>
            <button className="btn" onClick={() => setWeighIn(false)}>Cancel</button>
            <button
              className="btn btn--primary"
              onClick={() => {
                dispatch({ type: 'logBodyweight', kg: Math.round(newWeight * 10) / 10 });
                setWeighIn(false);
              }}
            >
              Save
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
