import { describe, expect, it } from 'vitest';
import { currentDay, initialState, migrate, reducer, STATE_VERSION } from '../state';
import { getExercise } from '../../data/exercises';
import { platesFor } from '../../engine/plates';
import { targetFiveRepMax } from '../../engine/starting';
import type { Action } from '../state';
import type { AppState, Profile } from '../../types';

const profile: Profile = {
  name: 'Test',
  sex: 'male',
  age: 28,
  heightCm: 178,
  bodyweightKg: 78,
  experience: 'never',
  daysPerWeek: 3,
  hasRack: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const run = (state: AppState, actions: Action[]): AppState => actions.reduce(reducer, state);

const onboarded = () => reducer(initialState, { type: 'onboard', profile, programId: 'strength-5x5' });

/** Log a session where every set hits its target. */
function perfectSession(state: AppState): AppState {
  let next = reducer(state, { type: 'startSession' });
  next.active!.exercises.forEach((ex, i) => {
    ex.sets.forEach((_, j) => {
      next = reducer(next, { type: 'toggleSet', exerciseIndex: i, setIndex: j });
    });
  });
  return reducer(next, { type: 'finishSession', durationSec: 2400 });
}

/** Log a session where one named lift misses its last set. */
function failingSession(state: AppState, failId: string): AppState {
  let next = reducer(state, { type: 'startSession' });
  next.active!.exercises.forEach((ex, i) => {
    ex.sets.forEach((set, j) => {
      if (ex.exerciseId === failId && j === ex.sets.length - 1) {
        next = reducer(next, { type: 'setReps', exerciseIndex: i, setIndex: j, reps: set.targetReps - 2 });
      } else {
        next = reducer(next, { type: 'toggleSet', exerciseIndex: i, setIndex: j });
      }
    });
  });
  return reducer(next, { type: 'finishSession', durationSec: 2400 });
}

describe('onboarding', () => {
  it('seeds the program, lifts and first weigh-in', () => {
    const s = onboarded();
    expect(s.programId).toBe('strength-5x5');
    expect(Object.keys(s.lifts)).toHaveLength(5);
    expect(s.bodyweightLog).toHaveLength(1);
    expect(currentDay(s)?.id).toBe('A');
  });
});

describe('running a session', () => {
  it('adds weight to every lift after a clean session', () => {
    const before = onboarded();
    const squatBefore = before.lifts['squat'].workingWeight;
    const after = perfectSession(before);

    expect(after.active).toBeNull();
    expect(after.sessions).toHaveLength(1);
    expect(after.lifts['squat'].workingWeight).toBe(squatBefore + 5);
    expect(after.lifts['bench'].workingWeight).toBe(before.lifts['bench'].workingWeight + 2.5);
    expect(after.sessions[0].exercises.every((e) => e.outcome === 'progressed')).toBe(true);
  });

  it('alternates day A and day B', () => {
    let s = onboarded();
    expect(currentDay(s)?.id).toBe('A');
    s = perfectSession(s);
    expect(currentDay(s)?.id).toBe('B');
    s = perfectSession(s);
    expect(currentDay(s)?.id).toBe('A');
  });

  it('repeats the weight on the lift that was missed and progresses the rest', () => {
    const before = onboarded();
    const after = failingSession(before, 'bench');
    expect(after.lifts['bench'].workingWeight).toBe(before.lifts['bench'].workingWeight);
    expect(after.lifts['bench'].consecutiveFailures).toBe(1);
    expect(after.lifts['squat'].workingWeight).toBe(before.lifts['squat'].workingWeight + 5);
  });

  it('honours a weight the lifter overrode in the gym', () => {
    let s = reducer(onboarded(), { type: 'startSession' });
    const idx = s.active!.exercises.findIndex((e) => e.exerciseId === 'squat');
    const original = s.active!.exercises[idx].weight;
    s = reducer(s, { type: 'adjustWeight', exerciseIndex: idx, delta: 2.5 });
    expect(s.active!.exercises[idx].sets.every((set) => set.weight === original + 2.5)).toBe(true);
    s.active!.exercises[idx].sets.forEach((_, j) => {
      s = reducer(s, { type: 'toggleSet', exerciseIndex: idx, setIndex: j });
    });
    s = reducer(s, { type: 'finishSession', durationSec: 100 });
    // Progression continues from the weight actually lifted, not the planned one.
    expect(s.lifts['squat'].workingWeight).toBe(original + 2.5 + 5);
  });

  it('leaves a skipped exercise untouched', () => {
    const before = onboarded();
    let s = reducer(before, { type: 'startSession' });
    s = reducer(s, { type: 'skipExercise', exerciseIndex: 0 });
    const skippedId = s.active!.exercises[0].exerciseId;
    s = reducer(s, { type: 'finishSession', durationSec: 100 });
    expect(s.lifts[skippedId].workingWeight).toBe(before.lifts[skippedId].workingWeight);
    expect(s.sessions[0].exercises[0].outcome).toBe('skipped');
  });

  it('treats an untouched exercise as skipped rather than as a failure', () => {
    const before = onboarded();
    let s = reducer(before, { type: 'startSession' });
    s = reducer(s, { type: 'finishSession', durationSec: 60 });
    expect(s.sessions[0].exercises.every((e) => e.outcome === 'skipped')).toBe(true);
    expect(s.lifts['squat'].consecutiveFailures).toBe(0);
    expect(s.lifts['squat'].workingWeight).toBe(before.lifts['squat'].workingWeight);
  });

  it('discards a cancelled session entirely', () => {
    const before = onboarded();
    const s = run(before, [{ type: 'startSession' }, { type: 'cancelSession' }]);
    expect(s.sessions).toHaveLength(0);
    expect(s.dayCursor).toBe(0);
    expect(s.lifts['squat'].workingWeight).toBe(before.lifts['squat'].workingWeight);
  });
});

describe('a lifter over several weeks', () => {
  it('climbs, stalls, and gets deloaded without intervention', () => {
    let s = onboarded();
    const start = s.lifts['squat'].workingWeight;

    // Six clean sessions: the squat is trained on both days, so +5kg each time.
    for (let i = 0; i < 6; i++) s = perfectSession(s);
    expect(s.lifts['squat'].workingWeight).toBe(start + 30);
    expect(s.lifts['squat'].deloads).toBe(0);

    // Then the wheels come off: three sessions missing the squat.
    const stallWeight = s.lifts['squat'].workingWeight;
    s = failingSession(s, 'squat');
    s = failingSession(s, 'squat');
    expect(s.lifts['squat'].workingWeight).toBe(stallWeight);
    s = failingSession(s, 'squat');

    expect(s.lifts['squat'].deloads).toBe(1);
    expect(s.lifts['squat'].workingWeight).toBeLessThan(stallWeight);
    expect(s.lifts['squat'].lastStallWeight).toBe(stallWeight);
    expect(s.sessions[0].exercises.find((e) => e.exerciseId === 'squat')?.outcome).toBe('deloaded');

    // And it recovers from there.
    s = perfectSession(s);
    expect(s.lifts['squat'].consecutiveFailures).toBe(0);
    expect(s.sessions[0].exercises.find((e) => e.exerciseId === 'squat')?.outcome).toBe('progressed');
  });
});

describe('program switching', () => {
  it('carries weights over and resets the rotation', () => {
    let s = onboarded();
    s = perfectSession(s);
    const squat = s.lifts['squat'].workingWeight;
    s = reducer(s, { type: 'switchProgram', programId: 'upper-lower', promotionKey: 'a->b' });
    expect(s.programId).toBe('upper-lower');
    expect(s.dayCursor).toBe(0);
    expect(s.lifts['squat'].workingWeight).toBe(squat);
    expect(s.lifts['leg-press'].workingWeight).toBeGreaterThan(0);
    expect(s.handledPromotions).toContain('a->b');
  });
});

describe('bodyweight and profile', () => {
  it('appends weigh-ins and keeps the profile in sync', () => {
    const s = run(onboarded(), [
      { type: 'logBodyweight', kg: 79.4 },
      { type: 'logBodyweight', kg: 80.1 },
    ]);
    expect(s.bodyweightLog).toHaveLength(3);
    expect(s.profile?.bodyweightKg).toBe(80.1);
  });

  it('skipping a day advances the rotation without logging anything', () => {
    const s = reducer(onboarded(), { type: 'skipDay' });
    expect(currentDay(s)?.id).toBe('B');
    expect(s.sessions).toHaveLength(0);
  });

  it('resets to a blank slate', () => {
    const s = reducer(perfectSession(onboarded()), { type: 'reset' });
    expect(s.profile).toBeNull();
    expect(s.sessions).toHaveLength(0);
  });
});

describe('robustness against an incomplete saved state', () => {
  it('falls back to the body estimate when a program lift has no saved weight', () => {
    // Reachable by importing a backup taken before the current program existed.
    const base = onboarded();
    const stripped: AppState = {
      ...base,
      programId: 'upper-lower',
      lifts: { squat: base.lifts['squat'] },
    };
    const started = reducer(stripped, { type: 'startSession' });
    for (const ex of started.active!.exercises) {
      const meta = started.active!.exercises.find((e) => e.exerciseId === ex.exerciseId)!;
      if (ex.exerciseId === 'hanging-knee-raise' || ex.exerciseId === 'plank') continue;
      expect(meta.weight, `${ex.exerciseId} was prescribed 0kg`).toBeGreaterThan(0);
    }
  });
});

// --- Regressions -------------------------------------------------------------------------

describe('logged reps survive a set being re-ticked', () => {
  it('keeps a hand-entered rep count when a set is un-ticked and ticked again', () => {
    // Tapping a set means "I hit the target", so ticking one fills in the target reps.
    // That used to overwrite a count the lifter had typed in, turning a missed set into a
    // completed one and handing out weight nobody earned.
    let state = reducer(onboarded(), { type: 'startSession' });
    state = reducer(state, { type: 'setReps', exerciseIndex: 0, setIndex: 0, reps: 2 });
    expect(state.active!.exercises[0].sets[0].reps).toBe(2);

    state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    expect(state.active!.exercises[0].sets[0].reps).toBe(2);
    expect(state.active!.exercises[0].sets[0].completed).toBe(true);
  });

  it('still fills in the target for a set that was never edited', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    const target = state.active!.exercises[0].sets[0].targetReps;
    state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    expect(state.active!.exercises[0].sets[0].reps).toBe(target);
  });

  it('does not progress a lift whose short set was re-ticked', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    const before = state.lifts['squat'].workingWeight;
    state = reducer(state, { type: 'setReps', exerciseIndex: 0, setIndex: 0, reps: 1 });
    state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    state.active!.exercises[0].sets.forEach((s, j) => {
      if (!s.completed) state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: j });
    });
    state = reducer(state, { type: 'finishSession', durationSec: 100 });
    expect(state.lifts['squat'].workingWeight).toBe(before);
  });
});

describe('skipping an exercise can be undone', () => {
  it('restores a skipped exercise to the session', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    state = reducer(state, { type: 'skipExercise', exerciseIndex: 1 });
    expect(state.active!.exercises[1].outcome).toBe('skipped');
    state = reducer(state, { type: 'unskipExercise', exerciseIndex: 1 });
    expect(state.active!.exercises[1].outcome).toBe('held');
  });

  it('lets an un-skipped exercise progress normally', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    const before = state.lifts['bench'].workingWeight;
    state = reducer(state, { type: 'skipExercise', exerciseIndex: 1 });
    state = reducer(state, { type: 'unskipExercise', exerciseIndex: 1 });
    state.active!.exercises[1].sets.forEach((_, j) => {
      state = reducer(state, { type: 'toggleSet', exerciseIndex: 1, setIndex: j });
    });
    state = reducer(state, { type: 'finishSession', durationSec: 100 });
    expect(state.lifts['bench'].workingWeight).toBeGreaterThan(before);
  });
});

describe('warm-up sets', () => {
  it('ramps a heavy lift and leaves the working sets alone', () => {
    let state = onboarded();
    state = { ...state, lifts: { ...state.lifts, squat: { ...state.lifts['squat'], workingWeight: 100 } } };
    state = reducer(state, { type: 'startSession' });
    const squat = state.active!.exercises.find((e) => e.exerciseId === 'squat')!;
    expect(squat.warmups!.length).toBeGreaterThan(1);
    expect(squat.sets.every((s) => s.weight === 100)).toBe(true);
  });

  it('never counts a warm-up toward the progression verdict', () => {
    let state = onboarded();
    state = { ...state, lifts: { ...state.lifts, squat: { ...state.lifts['squat'], workingWeight: 100 } } };
    state = reducer(state, { type: 'startSession' });
    const index = state.active!.exercises.findIndex((e) => e.exerciseId === 'squat');
    // Every warm-up done, not one working set touched: that is a skipped lift.
    state.active!.exercises[index].warmups!.forEach((_, j) => {
      state = reducer(state, { type: 'toggleWarmup', exerciseIndex: index, setIndex: j });
    });
    state = reducer(state, { type: 'finishSession', durationSec: 100 });
    expect(state.sessions[0].exercises[index].outcome).toBe('skipped');
    expect(state.lifts['squat'].workingWeight).toBe(100);
  });

  it('rebuilds the ramp when the working weight is adjusted', () => {
    let state = onboarded();
    state = { ...state, lifts: { ...state.lifts, squat: { ...state.lifts['squat'], workingWeight: 100 } } };
    state = reducer(state, { type: 'startSession' });
    const before = state.active!.exercises[0].warmups!.map((s) => s.weight);
    state = reducer(state, { type: 'adjustWeight', exerciseIndex: 0, delta: 40 });
    const after = state.active!.exercises[0].warmups!.map((s) => s.weight);
    expect(after).not.toEqual(before);
  });

  it('produces no ramp when the setting is off', () => {
    let state = reducer(onboarded(), { type: 'updateSettings', patch: { warmups: false } });
    state = { ...state, lifts: { ...state.lifts, squat: { ...state.lifts['squat'], workingWeight: 100 } } };
    state = reducer(state, { type: 'startSession' });
    expect(state.active!.exercises[0].warmups).toBeUndefined();
  });
});

describe('exercise substitution', () => {
  it('swaps a lift for the session only', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    state = reducer(state, {
      type: 'substituteExercise',
      exerciseIndex: 1,
      exerciseId: 'db-bench',
      permanent: false,
    });
    expect(state.active!.exercises[1].exerciseId).toBe('db-bench');
    expect(state.active!.exercises[1].sourceExerciseId).toBe('bench');
    expect(state.substitutions).toEqual({});
  });

  it('progresses the substitute using the slot it filled', () => {
    // The scheme belongs to the slot, not to the lift standing in for it. Looking it up
    // under the substitute's own name silently finds nothing and the weight never moves.
    let state = reducer(onboarded(), { type: 'startSession' });
    state = reducer(state, {
      type: 'substituteExercise',
      exerciseIndex: 1,
      exerciseId: 'db-bench',
      permanent: false,
    });
    const before = state.lifts['db-bench'].workingWeight;
    state.active!.exercises[1].sets.forEach((_, j) => {
      state = reducer(state, { type: 'toggleSet', exerciseIndex: 1, setIndex: j });
    });
    state = reducer(state, { type: 'finishSession', durationSec: 100 });
    expect(state.lifts['db-bench'].workingWeight).toBeGreaterThan(before);
    expect(state.sessions[0].exercises[1].outcome).toBe('progressed');
  });

  it('leaves the original lift untouched by a session swap', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    const benchBefore = state.lifts['bench'].workingWeight;
    state = reducer(state, {
      type: 'substituteExercise',
      exerciseIndex: 1,
      exerciseId: 'db-bench',
      permanent: false,
    });
    state.active!.exercises[1].sets.forEach((_, j) => {
      state = reducer(state, { type: 'toggleSet', exerciseIndex: 1, setIndex: j });
    });
    state = reducer(state, { type: 'finishSession', durationSec: 100 });
    expect(state.lifts['bench'].workingWeight).toBe(benchBefore);
  });

  it('applies a permanent swap to every future session', () => {
    let state = reducer(onboarded(), { type: 'setSubstitution', from: 'bench', to: 'db-bench' });
    expect(state.substitutions).toEqual({ bench: 'db-bench' });
    expect(state.lifts['db-bench']).toBeDefined();
    state = reducer(state, { type: 'startSession' });
    expect(state.active!.exercises.map((e) => e.exerciseId)).toContain('db-bench');
    expect(state.active!.exercises.map((e) => e.exerciseId)).not.toContain('bench');
  });

  it('restores the prescribed lift, keeping the weight built up on both', () => {
    let state = reducer(onboarded(), { type: 'setSubstitution', from: 'bench', to: 'db-bench' });
    const dbWeight = state.lifts['db-bench'].workingWeight;
    state = reducer(state, { type: 'restoreExercise', exerciseId: 'bench' });
    expect(state.substitutions).toEqual({});
    expect(state.lifts['db-bench'].workingWeight).toBe(dbWeight);
    expect(state.lifts['bench']).toBeDefined();
  });

  it('seeds a swapped-in lift from current strength, not from scratch', () => {
    // Someone six months in should not be handed a beginner's first-session weight for a
    // movement that is new to them.
    const beginner = reducer(onboarded(), {
      type: 'setSubstitution',
      from: 'bench',
      to: 'chest-press-machine',
    });

    let trained = onboarded();
    for (let i = 0; i < 30; i++) trained = perfectSession(trained);
    trained = reducer(trained, { type: 'setSubstitution', from: 'bench', to: 'chest-press-machine' });

    expect(trained.lifts['chest-press-machine'].workingWeight).toBeGreaterThan(
      beginner.lifts['chest-press-machine'].workingWeight,
    );
    // And never above the standard the lift is aimed at.
    expect(trained.lifts['chest-press-machine'].workingWeight).toBeLessThanOrEqual(
      targetFiveRepMax(profile, 'chest-press-machine'),
    );
  });
});

describe('stored state survives a version bump', () => {
  it('migrates a v1 state instead of erasing it', () => {
    const v1: any = {
      ...onboarded(),
      version: 1,
      settings: { barKg: 20, plates: [25, 20], restSecMain: 180, restSecAccessory: 90, sound: true },
    };
    delete v1.substitutions;
    const migrated = migrate(v1);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(STATE_VERSION);
    expect(migrated!.sessions).toEqual(v1.sessions);
    expect(migrated!.lifts).toEqual(v1.lifts);
    expect(migrated!.substitutions).toEqual({});
    expect(migrated!.settings.warmups).toBe(true);
    expect(migrated!.settings.plates).toEqual([25, 20]);
  });

  it('refuses a state from a newer build rather than mangling it', () => {
    expect(migrate({ ...onboarded(), version: STATE_VERSION + 1 })).toBeNull();
  });

  it('rejects anything that is not an Ironpath backup', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate({})).toBeNull();
    expect(migrate({ version: 2 })).toBeNull();
    expect(migrate('nope')).toBeNull();
    expect(migrate({ version: 2, lifts: {}, sessions: 'no', bodyweightLog: [], settings: {} })).toBeNull();
  });

  it('accepts a current backup unchanged', () => {
    const state = onboarded();
    const restored = migrate(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state);
  });

  it('fills in settings the stored state predates', () => {
    const partial: any = { ...onboarded(), settings: { barKg: 15 } };
    const migrated = migrate(partial)!;
    expect(migrated.settings.barKg).toBe(15);
    expect(migrated.settings.restSecMain).toBe(initialState.settings.restSecMain);
  });
});

describe('measurement updates stamp the height clock', () => {
  it('records when height was last confirmed', () => {
    const state = reducer(onboarded(), {
      type: 'updateProfile',
      patch: { heightCm: 180, heightMeasuredAt: '2026-06-01T00:00:00.000Z' },
    });
    expect(state.profile!.heightMeasuredAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('progression respects the plates the gym owns', () => {
  it('never prescribes a weight the bar cannot be loaded to', () => {
    // With no 1.25kg pair the smallest barbell jump is 5kg, so a 2.5kg step has to
    // round up rather than prescribe a weight that cannot be built.
    let state = reducer(onboarded(), {
      type: 'updateSettings',
      patch: { plates: [25, 20, 15, 10, 5, 2.5] },
    });
    for (let i = 0; i < 6; i++) state = perfectSession(state);
    for (const lift of Object.values(state.lifts)) {
      const ex = getExercise(lift.exerciseId);
      if (ex.equipment !== 'barbell') continue;
      expect(
        platesFor(lift.workingWeight, state.settings.barKg, state.settings.plates).remainder,
        `${lift.exerciseId} at ${lift.workingWeight}kg`,
      ).toBe(0);
    }
  });

  it('still moves the bar up when the small plates are missing', () => {
    let state = reducer(onboarded(), {
      type: 'updateSettings',
      patch: { plates: [25, 20, 15, 10, 5] },
    });
    const before = state.lifts['bench'].workingWeight;
    state = perfectSession(state);
    expect(state.lifts['bench'].workingWeight).toBeGreaterThan(before);
  });
});

describe('session notes', () => {
  it('stores a note against the session', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    state = reducer(state, { type: 'finishSession', durationSec: 100, notes: '  left knee twinge  ' });
    expect(state.sessions[0].notes).toBe('left knee twinge');
  });

  it('stores nothing for an empty note', () => {
    let state = reducer(onboarded(), { type: 'startSession' });
    state = reducer(state, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    state = reducer(state, { type: 'finishSession', durationSec: 100, notes: '   ' });
    expect(state.sessions[0].notes).toBeUndefined();
  });
});
