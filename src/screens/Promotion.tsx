import { getExercise } from '../data/exercises';
import { carryOverWeights, type Promotion as PromotionType } from '../engine/graduation';
import { isLoaded, seedNewLift } from '../engine/starting';
import { fmt } from '../engine/progression';
import { useStore } from '../store/StoreContext';
import { Card, Pill } from '../components/ui';

/**
 * The graduation screen. A beginner has no way to know when a program has stopped
 * working, so the app explains what changed and what the next one does differently.
 */
export function PromotionScreen({ promotion, onClose }: { promotion: PromotionType; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const profile = state.profile!;
  const nextLifts = carryOverWeights(state.lifts, promotion.to.id, (id) => seedNewLift(state.lifts, profile, id));

  const carried = Object.values(nextLifts).filter((l) => state.lifts[l.exerciseId]);
  const fresh = Object.values(nextLifts).filter((l) => !state.lifts[l.exerciseId] && isLoaded(l.exerciseId));

  return (
    <div className="screen screen--plain">
      <div className="row" style={{ marginBottom: 12 }}>
        <Pill tone="accent">{promotion.urgent ? 'Program complete' : 'Upgrade available'}</Pill>
        <button className="btn btn--ghost small" onClick={onClose} style={{ padding: '4px 8px' }}>
          Close
        </button>
      </div>

      <h1>{promotion.headline}</h1>
      <p className="muted">
        {promotion.from.name} → {promotion.to.name}
      </p>

      <Card variant="accent">
        <h2 style={{ marginBottom: 4 }}>{promotion.to.name}</h2>
        <div className="tiny" style={{ marginBottom: 10 }}>{promotion.to.tagline}</div>
        <p className="small muted" style={{ marginBottom: 0 }}>{promotion.to.description}</p>
      </Card>

      <Card>
        <h3>Why now</h3>
        <ul className="notelist">
          {promotion.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3>What you keep</h3>
        <p className="small muted">These lifts carry over at exactly the weight you're on now.</p>
        {carried
          .filter((l) => isLoaded(l.exerciseId))
          .map((l) => (
            <div className="liftrow" key={l.exerciseId}>
              <div className="lift-name">{getExercise(l.exerciseId).name}</div>
              <span className="lift-weight num">{fmt(l.workingWeight)}kg</span>
            </div>
          ))}
      </Card>

      {fresh.length > 0 && (
        <Card>
          <h3>What's new</h3>
          <p className="small muted">
            Scaled from what you're lifting now, then backed off — the movement is new to you, so the first
            few sessions are for learning it.
          </p>
          {fresh.map((l) => (
            <div className="liftrow" key={l.exerciseId}>
              <div className="lift-name">
                <div>{getExercise(l.exerciseId).name}</div>
                <div className="small muted">{getExercise(l.exerciseId).cues[0]}</div>
              </div>
              <span className="lift-weight num">{fmt(l.workingWeight)}kg</span>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <h3>The week</h3>
        {promotion.to.days.map((d) => (
          <div className="liftrow" key={d.id}>
            <div className="lift-name">
              <div>{d.name}</div>
              <div className="small muted">
                {d.slots.map((s) => getExercise(s.exerciseId).name).join(' · ')}
              </div>
            </div>
          </div>
        ))}
      </Card>

      <button
        className="btn btn--primary btn--block btn--lg"
        onClick={() => {
          dispatch({ type: 'switchProgram', programId: promotion.to.id, promotionKey: promotion.key });
          onClose();
        }}
      >
        Move to {promotion.to.name}
      </button>
      <button
        className="btn btn--ghost btn--block small"
        style={{ marginTop: 8 }}
        onClick={() => {
          dispatch({ type: 'dismissPromotion', key: promotion.key });
          onClose();
        }}
      >
        Stay on {promotion.from.name} for now
      </button>
    </div>
  );
}
