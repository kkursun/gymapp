import { describe, expect, it } from 'vitest';
import {
  applyProgression,
  buildSets,
  currentTarget,
  describeReps,
  estimate1RM,
  isSessionSuccessful,
  stepFor,
} from '../progression';
import type { LiftState, LoggedSet, SetScheme } from '../../types';

/** The fixed 5×5 scheme the linear tests below are written against. */
const LINEAR: SetScheme = { sets: 5, reps: 5 };

const lift = (over: Partial<LiftState> = {}): LiftState => ({
  exerciseId: 'squat',
  workingWeight: 60,
  consecutiveFailures: 0,
  deloads: 0,
  bestWeight: 0,
  bestEstimated1RM: 0,
  ...over,
});

const sets = (reps: number[], target = 5, weight = 60): LoggedSet[] =>
  reps.map((r) => ({ targetReps: target, reps: r, weight, completed: true }));

describe('progression steps', () => {
  it('adds 5kg to lower-body lifts and 2.5kg to upper', () => {
    expect(stepFor('lower', 2.5)).toBe(5);
    expect(stepFor('upper', 2.5)).toBe(2.5);
    expect(stepFor('bodyweight', 0)).toBe(0);
  });

  it('progresses when every prescribed rep is hit', () => {
    const r = applyProgression(lift(), sets([5, 5, 5, 5, 5]), LINEAR);
    expect(r.outcome).toBe('progressed');
    expect(r.nextWeight).toBe(65);
    expect(r.next.consecutiveFailures).toBe(0);
  });

  it('holds the weight on a single missed rep', () => {
    const r = applyProgression(lift(), sets([5, 5, 5, 5, 4]), LINEAR);
    expect(r.outcome).toBe('held');
    expect(r.nextWeight).toBe(60);
    expect(r.next.consecutiveFailures).toBe(1);
  });

  it('counts extra reps as a success', () => {
    const r = applyProgression(lift(), sets([6, 5, 5, 5, 5]), LINEAR);
    expect(r.outcome).toBe('progressed');
  });

  it('deloads 10% after three consecutive failures', () => {
    let state = lift();
    let result = applyProgression(state, sets([5, 5, 5, 5, 3]), LINEAR);
    expect(result.outcome).toBe('held');
    state = result.next;

    result = applyProgression(state, sets([5, 5, 5, 4, 3]), LINEAR);
    expect(result.outcome).toBe('held');
    expect(result.next.consecutiveFailures).toBe(2);
    state = result.next;

    result = applyProgression(state, sets([5, 5, 4, 3, 3]), LINEAR);
    expect(result.outcome).toBe('deloaded');
    expect(result.nextWeight).toBe(55); // 60 * 0.9 = 54 → rounded to the 2.5kg increment
    expect(result.next.deloads).toBe(1);
    expect(result.next.consecutiveFailures).toBe(0);
    expect(result.next.lastStallWeight).toBe(60);
  });

  it('resets the failure counter after a good session', () => {
    const missed = applyProgression(lift(), sets([5, 5, 5, 5, 2]), LINEAR);
    expect(missed.next.consecutiveFailures).toBe(1);
    const recovered = applyProgression(missed.next, sets([5, 5, 5, 5, 5]), LINEAR);
    expect(recovered.next.consecutiveFailures).toBe(0);
    expect(recovered.outcome).toBe('progressed');
  });

  it('never deloads below the minimum load of the lift', () => {
    // Empty bar: a 10% cut cannot make a lighter barbell, so it holds instead.
    const state = lift({ workingWeight: 20, consecutiveFailures: 2 });
    const r = applyProgression(state, sets([3, 3, 2], 5, 20), LINEAR);
    expect(r.outcome).toBe('held');
    expect(r.nextWeight).toBe(20);
    expect(r.next.deloads).toBe(0);
  });

  it('records a personal best only for completed sessions', () => {
    const good = applyProgression(lift({ workingWeight: 80 }), sets([5, 5, 5, 5, 5], 5, 80), LINEAR);
    expect(good.next.bestWeight).toBe(80);
    const bad = applyProgression(lift({ workingWeight: 100, bestWeight: 80 }), sets([2], 5, 100), LINEAR);
    expect(bad.next.bestWeight).toBe(80);
  });

  it('treats bodyweight movements as load-free', () => {
    const plank = lift({ exerciseId: 'plank', workingWeight: 0 });
    const r = applyProgression(
      plank,
      Array.from({ length: 3 }, () => ({ targetReps: 30, reps: 45, weight: 0, completed: true })),
      { sets: 3, reps: 30 },
    );
    expect(r.nextWeight).toBe(0);
    expect(r.outcome).toBe('progressed');
  });

  it('ignores an empty set list rather than calling it a success', () => {
    expect(isSessionSuccessful([], LINEAR)).toBe(false);
  });

  // Regression: a session cut short used to be judged on the handful of sets that were
  // logged, so ticking one set of five added weight and banked a personal best.
  it('does not judge a lift on a session that was cut short', () => {
    const before = lift({ workingWeight: 60, consecutiveFailures: 1 });
    const r = applyProgression(before, sets([5]), LINEAR);
    expect(r.outcome).toBe('held');
    expect(r.nextWeight).toBe(60);
    expect(r.next.bestWeight).toBe(0);
    expect(r.next.bestEstimated1RM).toBe(0);
    expect(r.next.consecutiveFailures).toBe(1);
    expect(r.message).toContain('1 of 5 sets');
  });

  it('needs every prescribed set, not just every logged one, to progress', () => {
    expect(isSessionSuccessful(sets([5, 5, 5, 5]), LINEAR)).toBe(false);
    expect(isSessionSuccessful(sets([5, 5, 5, 5, 5]), LINEAR)).toBe(true);
  });

  it('still deloads a lifter who does the work and misses the reps', () => {
    const r = applyProgression(lift({ consecutiveFailures: 2 }), sets([4, 4, 4, 3, 3]), LINEAR);
    expect(r.outcome).toBe('deloaded');
  });
});

describe('helpers', () => {
  it('estimates a 1RM that grows with reps', () => {
    expect(estimate1RM(100, 1)).toBeCloseTo(103.33, 1);
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimate1RM(0, 5)).toBe(0);
  });

  it('builds a blank set list from the scheme', () => {
    const s = buildSets({ sets: 5, reps: 5 }, 60);
    expect(s).toHaveLength(5);
    expect(s.every((x) => x.weight === 60 && x.targetReps === 5 && !x.completed)).toBe(true);
  });
});

describe('double progression (rep ranges)', () => {
  // 3 sets of 8-12: reps climb first, then the weight.
  const RANGE: SetScheme = { sets: 3, reps: 8, maxReps: 12 };
  /** `target` is what was prescribed; `got` what was actually managed (defaults to a hit). */
  const at = (target: number, got = target, weight = 40): LoggedSet[] =>
    Array.from({ length: 3 }, () => ({ targetReps: target, reps: got, weight, completed: true }));

  it('adds reps rather than weight while there is room in the range', () => {
    const r = applyProgression(lift({ exerciseId: 'db-curl', workingWeight: 40 }), at(8), RANGE);
    expect(r.outcome).toBe('progressed');
    expect(r.nextWeight).toBe(40);
    expect(r.nextReps).toBe(9);
    expect(r.next.workingReps).toBe(9);
  });

  it('climbs the whole range one rep at a time', () => {
    let state = lift({ exerciseId: 'db-curl', workingWeight: 40 });
    for (const expected of [9, 10, 11, 12]) {
      const r = applyProgression(state, at(currentTarget(state, RANGE)), RANGE);
      expect(r.nextReps).toBe(expected);
      expect(r.nextWeight).toBe(40);
      state = r.next;
    }
    expect(state.workingReps).toBe(12);
  });

  it('adds weight and resets to the bottom once the top is reached', () => {
    const topped = lift({ exerciseId: 'db-curl', workingWeight: 40, workingReps: 12 });
    const r = applyProgression(topped, at(12), RANGE);
    expect(r.outcome).toBe('progressed');
    expect(r.nextWeight).toBeGreaterThan(40);
    expect(r.nextReps).toBe(8);
    expect(r.message).toMatch(/back to 8 reps/);
  });

  it('backs the reps off instead of the weight when a range lift stalls', () => {
    let state = lift({ exerciseId: 'db-curl', workingWeight: 40, workingReps: 11 });
    for (let i = 0; i < 2; i++) {
      const r = applyProgression(state, at(11, 9), RANGE);
      expect(r.outcome).toBe('held');
      state = r.next;
    }
    const third = applyProgression(state, at(11, 9), RANGE);
    expect(third.outcome).toBe('deloaded');
    // The weight is untouched — only the rep target resets.
    expect(third.nextWeight).toBe(40);
    expect(third.nextReps).toBe(8);
    expect(third.next.deloads).toBe(0);
  });

  it('falls back to a weight deload when the reps are already at the bottom', () => {
    const state = lift({ exerciseId: 'db-curl', workingWeight: 40, workingReps: 8, consecutiveFailures: 2 });
    const r = applyProgression(state, at(8, 5), RANGE);
    expect(r.outcome).toBe('deloaded');
    expect(r.nextWeight).toBeLessThan(40);
    expect(r.nextReps).toBe(8);
    expect(r.next.deloads).toBe(1);
  });
});

describe('bodyweight movements now progress', () => {
  // The plank counts seconds, so it moves in fives.
  const PLANK: SetScheme = { sets: 3, reps: 20, maxReps: 60, repStep: 5 };
  const held = (target: number, got = target): LoggedSet[] =>
    Array.from({ length: 3 }, () => ({ targetReps: target, reps: got, weight: 0, completed: true }));

  it('adds time to a plank that was held for the full target', () => {
    const r = applyProgression(lift({ exerciseId: 'plank', workingWeight: 0 }), held(20), PLANK);
    expect(r.outcome).toBe('progressed');
    expect(r.nextReps).toBe(25);
    expect(r.next.workingReps).toBe(25);
  });

  it('walks a plank all the way up its range instead of sitting at 30s forever', () => {
    let state = lift({ exerciseId: 'plank', workingWeight: 0 });
    for (let i = 0; i < 8; i++) {
      state = applyProgression(state, held(currentTarget(state, PLANK)), PLANK).next;
    }
    expect(state.workingReps).toBe(60);
  });

  it('tells the lifter to make it harder once it tops out, rather than adding phantom weight', () => {
    const maxed = lift({ exerciseId: 'plank', workingWeight: 0, workingReps: 60 });
    const r = applyProgression(maxed, held(60), PLANK);
    expect(r.nextWeight).toBe(0);
    expect(r.nextReps).toBe(60);
    expect(r.message).toMatch(/harder variation/i);
  });

  it('never deloads a bodyweight lift into negative load', () => {
    const state = lift({ exerciseId: 'plank', workingWeight: 0, workingReps: 20, consecutiveFailures: 2 });
    const r = applyProgression(state, held(20, 8), PLANK);
    expect(r.nextWeight).toBe(0);
    expect(r.next.workingWeight).toBe(0);
  });
});

describe('rep target display', () => {
  it('shows a range before the lift starts and the live target after', () => {
    expect(describeReps({ sets: 3, reps: 8, maxReps: 12 })).toBe('8–12');
    expect(describeReps({ sets: 3, reps: 8, maxReps: 12 }, 10)).toBe('10');
    expect(describeReps({ sets: 5, reps: 5 })).toBe('5');
  });
});
