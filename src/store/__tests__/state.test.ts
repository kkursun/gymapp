import { describe, expect, it } from 'vitest';
import { currentDay, initialState, normalizeState, reducer, STATE_VERSION } from '../state';
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

describe('sessions that were cut short', () => {
  it('changes nothing when only some of the sets were logged', () => {
    const before = onboarded();
    let s = reducer(before, { type: 'startSession' });
    // One set of the squat's five, then "Finish early".
    s = reducer(s, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    s = reducer(s, { type: 'finishSession', durationSec: 300 });

    expect(s.lifts['squat'].workingWeight).toBe(before.lifts['squat'].workingWeight);
    expect(s.lifts['squat'].bestWeight).toBe(0);
    expect(s.lifts['squat'].consecutiveFailures).toBe(0);
    expect(s.sessions[0].exercises[0].outcome).toBe('held');
  });

  it('still records the session so the lifter can see they trained', () => {
    let s = reducer(onboarded(), { type: 'startSession' });
    s = reducer(s, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    s = reducer(s, { type: 'finishSession', durationSec: 300 });
    expect(s.sessions).toHaveLength(1);
    expect(s.dayCursor).toBe(1);
  });
});

describe('logging a set', () => {
  it('keeps a hand-entered rep count through an accidental double tap', () => {
    let s = reducer(onboarded(), { type: 'startSession' });
    s = reducer(s, { type: 'setReps', exerciseIndex: 0, setIndex: 0, reps: 3 });
    s = reducer(s, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    s = reducer(s, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });

    const set = s.active!.exercises[0].sets[0];
    expect(set.reps).toBe(3);
    expect(set.completed).toBe(true);
  });

  it('ticks an untouched set at its target', () => {
    let s = reducer(onboarded(), { type: 'startSession' });
    s = reducer(s, { type: 'toggleSet', exerciseIndex: 0, setIndex: 0 });
    const set = s.active!.exercises[0].sets[0];
    expect(set.reps).toBe(set.targetReps);
  });
});

describe('measurements', () => {
  it('stamps the height as confirmed when it is updated from Settings', () => {
    const before = onboarded();
    const s = reducer(before, { type: 'updateProfile', patch: { heightCm: 181 } });
    expect(s.profile!.heightCm).toBe(181);
    expect(s.profile!.heightMeasuredAt).not.toBe(before.profile!.heightMeasuredAt);
  });

  it('leaves the height clock alone when something else is patched', () => {
    const before = onboarded();
    const s = reducer(before, { type: 'updateProfile', patch: { hasRack: false } });
    expect(s.profile!.heightMeasuredAt).toBe(before.profile!.heightMeasuredAt);
  });
});

describe('restoring a backup', () => {
  it('fills in everything a truncated file left out', () => {
    const s = reducer(onboarded(), {
      type: 'import',
      state: { version: STATE_VERSION, lifts: {} } as unknown as AppState,
    });
    expect(s.settings).toEqual(initialState.settings);
    expect(s.sessions).toEqual([]);
    expect(s.bodyweightLog).toEqual([]);
    expect(s.handledPromotions).toEqual([]);
  });

  it('drops a program this build does not have rather than throwing on render', () => {
    const backup = { ...onboarded(), programId: 'some-removed-program' } as unknown as AppState;
    const s = reducer(initialState, { type: 'import', state: backup });
    expect(s.programId).toBeNull();
    expect(s.active).toBeNull();
  });

  it('refuses a profile whose numbers cannot be computed with', () => {
    const backup = {
      ...onboarded(),
      profile: { ...profile, bodyweightKg: Number.NaN },
    } as unknown as AppState;
    expect(reducer(initialState, { type: 'import', state: backup }).profile).toBeNull();
  });

  it('keeps a good backup intact', () => {
    const good = run(onboarded(), []);
    const s = reducer(initialState, { type: 'import', state: perfectSession(good) });
    expect(s.programId).toBe('strength-5x5');
    expect(s.sessions).toHaveLength(1);
    expect(Object.keys(s.lifts)).toHaveLength(5);
  });

  it('normalizes junk without throwing', () => {
    expect(() => normalizeState(null)).not.toThrow();
    expect(normalizeState(undefined).version).toBe(STATE_VERSION);
    expect(normalizeState({ sessions: 'nope' } as unknown as AppState).sessions).toEqual([]);
  });
});
