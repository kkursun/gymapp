import { useMemo, useState } from 'react';
import { EXERCISES, getExercise } from '../data/exercises';
import { fmt } from '../engine/progression';
import { isLoaded, startingWeight } from '../engine/starting';
import { useStore } from '../store/StoreContext';
import { Sheet, Stepper } from './ui';
import type { MuscleGroup } from '../types';

const GROUPS: { id: MuscleGroup; label: string }[] = [
  { id: 'legs', label: 'Legs' },
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'arms', label: 'Arms' },
  { id: 'core', label: 'Core' },
];

/** Planks are held for seconds; everything else is counted in reps. */
export function isTimed(exerciseId: string): boolean {
  return exerciseId === 'plank';
}

export interface ManualEntry {
  exerciseId: string;
  weight: number;
  reps: number;
  sets: number;
}

/**
 * Pick a lift from the library and say what you did on it. Used both mid-session, to add
 * something the program did not ask for, and from the home screen for work done outside
 * the rotation entirely.
 */
export function LiftEntrySheet({
  title,
  intro,
  confirmLabel,
  exclude = [],
  onConfirm,
  onClose,
}: {
  title: string;
  intro: string;
  confirmLabel: string;
  /** Lifts already on this session's card — still pickable, but flagged as such. */
  exclude?: string[];
  onConfirm: (entry: ManualEntry) => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const [chosen, setChosen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(EXERCISES).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [query]);

  if (chosen) {
    return (
      <LiftEntryForm
        exerciseId={chosen}
        confirmLabel={confirmLabel}
        onBack={() => setChosen(null)}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet onClose={onClose}>
      <h2>{title}</h2>
      <p className="small muted">{intro}</p>
      <input
        className="input"
        type="search"
        placeholder="Search lifts"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search lifts"
      />
      <div className="picker">
        {GROUPS.map((group) => {
          const inGroup = matches.filter((e) => e.primary === group.id);
          if (inGroup.length === 0) return null;
          return (
            <div key={group.id}>
              <div className="tiny" style={{ margin: '14px 0 6px' }}>{group.label}</div>
              {inGroup.map((e) => (
                <button key={e.id} className="pickrow" onClick={() => setChosen(e.id)}>
                  <span>{e.name}</span>
                  <span className="small muted">
                    {exclude.includes(e.id)
                      ? 'already in this session'
                      : state.lifts[e.id] && isLoaded(e.id)
                        ? `${fmt(state.lifts[e.id].workingWeight)}kg`
                        : ''}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
        {matches.length === 0 && <p className="small muted">No lift by that name.</p>}
      </div>
      <button className="btn btn--block" style={{ marginTop: 16 }} onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}

function LiftEntryForm({
  exerciseId,
  confirmLabel,
  onBack,
  onConfirm,
  onClose,
}: {
  exerciseId: string;
  confirmLabel: string;
  onBack: () => void;
  onConfirm: (entry: ManualEntry) => void;
  onClose: () => void;
}) {
  const { state } = useStore();
  const meta = getExercise(exerciseId);
  const lift = state.lifts[exerciseId];
  const timed = isTimed(exerciseId);
  const loaded = isLoaded(exerciseId);

  const [weight, setWeight] = useState(() => {
    if (!loaded) return 0;
    if (lift) return lift.workingWeight;
    return state.profile ? startingWeight(state.profile, exerciseId) : meta.minLoad;
  });
  const [reps, setReps] = useState(() => lift?.workingReps ?? (timed ? 30 : 8));
  const [sets, setSets] = useState(3);

  return (
    <Sheet onClose={onClose}>
      <h2>{meta.name}</h2>
      <p className="small muted">
        {loaded
          ? 'What you lifted, and for how many.'
          : 'Bodyweight movement — just the numbers you managed.'}
      </p>

      <div className="stack">
        {loaded && (
          <div>
            <div className="tiny">Weight</div>
            <Stepper
              value={weight}
              onChange={setWeight}
              step={meta.increment}
              min={meta.minLoad}
              suffix={meta.equipment === 'dumbbell' ? 'kg each' : 'kg'}
            />
          </div>
        )}
        <div>
          <div className="tiny">{timed ? 'Seconds per set' : 'Reps per set'}</div>
          <Stepper value={reps} onChange={setReps} step={timed ? 5 : 1} min={0} max={600} />
        </div>
        <div>
          <div className="tiny">Sets</div>
          <Stepper value={sets} onChange={setSets} step={1} min={1} max={20} />
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 14 }}>
        Logged as extra work: it counts toward your records and volume, but it will not
        move this lift's working weight up or down.
      </p>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn" onClick={onBack}>Back</button>
        <button
          className="btn btn--primary"
          onClick={() => {
            onConfirm({ exerciseId, weight, reps, sets });
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
