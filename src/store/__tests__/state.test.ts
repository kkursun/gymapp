import { describe, expect, it } from 'vitest';
import { currentDay, EXTRA_DAY_ID, initialState, reducer } from '../state';
import type { Action } from '../state';
import { checkPromotion } from '../../engine/graduation';
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

describe('adding reps by hand', () => {
  it('adds an extra set to a prescribed lift without letting it block progression', () => {
    const before = onboarded();
    let s = reducer(before, { type: 'startSession' });
    const idx = s.active!.exercises.findIndex((e) => e.exerciseId === 'squat');
    const prescribed = s.active!.exercises[idx].sets.length;

    s = reducer(s, { type: 'addSet', exerciseIndex: idx });
    expect(s.active!.exercises[idx].sets).toHaveLength(prescribed + 1);
    expect(s.active!.exercises[idx].sets[prescribed].manual).toBe(true);

    // Every prescribed set hit; the added set is a burnout set of two.
    for (let j = 0; j < prescribed; j++) {
      s = reducer(s, { type: 'toggleSet', exerciseIndex: idx, setIndex: j });
    }
    s = reducer(s, { type: 'setReps', exerciseIndex: idx, setIndex: prescribed, reps: 2 });
    s = reducer(s, { type: 'finishSession', durationSec: 100 });

    expect(s.lifts['squat'].workingWeight).toBe(before.lifts['squat'].workingWeight + 5);
    expect(s.sessions[0].exercises.find((e) => e.exerciseId === 'squat')?.outcome).toBe('progressed');
  });

  it('removes an added set but refuses to remove a prescribed one', () => {
    let s = reducer(onboarded(), { type: 'startSession' });
    const prescribed = s.active!.exercises[0].sets.length;
    s = reducer(s, { type: 'addSet', exerciseIndex: 0 });
    s = reducer(s, { type: 'removeSet', exerciseIndex: 0, setIndex: prescribed });
    expect(s.active!.exercises[0].sets).toHaveLength(prescribed);
    s = reducer(s, { type: 'removeSet', exerciseIndex: 0, setIndex: 0 });
    expect(s.active!.exercises[0].sets).toHaveLength(prescribed);
  });

  it('logs a lift the program never asked for, without moving anyone else', () => {
    const before = onboarded();
    let s = reducer(before, { type: 'startSession' });
    s = reducer(s, { type: 'addExercise', exerciseId: 'db-curl', weight: 12.5, reps: 10, sets: 3 });
    const idx = s.active!.exercises.findIndex((e) => e.exerciseId === 'db-curl');
    expect(s.active!.exercises[idx].adhoc).toBe(true);
    expect(s.active!.exercises[idx].sets.every((set) => set.manual)).toBe(true);

    s.active!.exercises[idx].sets.forEach((_, j) => {
      s = reducer(s, { type: 'toggleSet', exerciseIndex: idx, setIndex: j });
    });
    s = reducer(s, { type: 'finishSession', durationSec: 100 });

    const logged = s.sessions[0].exercises.find((e) => e.exerciseId === 'db-curl');
    expect(logged?.outcome).toBe('held');
    expect(logged?.sets).toHaveLength(3);
    // Recorded, but the curl was never prescribed, so there is no weight to move.
    expect(s.lifts['db-curl'].bestReps).toBe(10);
    expect(s.lifts['db-curl'].consecutiveFailures).toBe(0);
    expect(s.lifts['squat'].workingWeight).toBe(before.lifts['squat'].workingWeight);
  });

  it('gives extra sets to a lift already on the card rather than listing it twice', () => {
    let s = reducer(onboarded(), { type: 'startSession' });
    const id = s.active!.exercises[0].exerciseId;
    const prescribed = s.active!.exercises[0].sets.length;
    const count = s.active!.exercises.length;
    s = reducer(s, { type: 'addExercise', exerciseId: id, weight: 40, reps: 8, sets: 2 });
    expect(s.active!.exercises).toHaveLength(count);
    expect(s.active!.exercises[0].sets).toHaveLength(prescribed + 2);
  });
});

describe('lifts logged outside the program', () => {
  const extra = (state: AppState) =>
    reducer(state, { type: 'logExtraLift', exerciseId: 'db-curl', weight: 12.5, reps: 10, sets: 3 });

  it('records the work without touching the rotation', () => {
    const before = onboarded();
    const s = extra(before);
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].kind).toBe('extra');
    expect(s.sessions[0].dayId).toBe(EXTRA_DAY_ID);
    expect(s.sessions[0].exercises[0].sets).toHaveLength(3);
    // The next session is still the one the program had queued up.
    expect(s.dayCursor).toBe(before.dayCursor);
    expect(currentDay(s)?.id).toBe('A');
    expect(s.active).toBeNull();
  });

  it('banks a record but leaves the working weight to the program', () => {
    const s = extra(onboarded());
    expect(s.lifts['db-curl'].bestReps).toBe(10);
    expect(s.lifts['db-curl'].bestEstimated1RM).toBeGreaterThan(0);
    expect(s.lifts['db-curl'].consecutiveFailures).toBe(0);
    expect(s.lifts['db-curl'].deloads).toBe(0);
  });

  it('collects a day of extra lifts into one entry in the log', () => {
    const s = extra(extra(onboarded()));
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].exercises).toHaveLength(2);
  });

  it('does not count toward the program for graduation purposes', () => {
    let s = onboarded();
    for (let i = 0; i < 5; i++) s = extra(s);
    // Five logged lifts, zero program sessions — the promotion engine must see none.
    expect(s.sessions.filter((x) => x.kind !== 'extra')).toHaveLength(0);
    expect(checkPromotion(s)).toBeNull();
  });

  it('logs a bodyweight movement without inventing a load for it', () => {
    const s = reducer(onboarded(), {
      type: 'logExtraLift',
      exerciseId: 'plank',
      weight: 40,
      reps: 60,
      sets: 2,
    });
    expect(s.sessions[0].exercises[0].weight).toBe(0);
    expect(s.sessions[0].exercises[0].sets.every((set) => set.weight === 0)).toBe(true);
  });
});

describe('correcting a logged session', () => {
  it('fixes the record and leaves the already-decided weights alone', () => {
    const s = perfectSession(onboarded());
    const weightBefore = s.lifts['squat'].workingWeight;
    const exerciseIndex = s.sessions[0].exercises.findIndex((e) => e.exerciseId === 'squat');
    const fixed = reducer(s, {
      type: 'editLoggedSet',
      sessionId: s.sessions[0].id,
      exerciseIndex,
      setIndex: 0,
      reps: 3,
    });
    expect(fixed.sessions[0].exercises[exerciseIndex].sets[0].reps).toBe(3);
    expect(fixed.lifts['squat'].workingWeight).toBe(weightBefore);
  });

  it('ignores a correction aimed at a session that is gone', () => {
    const s = perfectSession(onboarded());
    const after = reducer(s, {
      type: 'editLoggedSet',
      sessionId: 'nope',
      exerciseIndex: 0,
      setIndex: 0,
      reps: 1,
    });
    expect(after.sessions).toEqual(s.sessions);
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
