import { describe, expect, it } from 'vitest';
import { applyProgression, buildSets, estimate1RM, isSessionSuccessful, stepFor } from '../progression';
import type { LiftState, LoggedSet } from '../../types';

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
    const r = applyProgression(lift(), sets([5, 5, 5, 5, 5]));
    expect(r.outcome).toBe('progressed');
    expect(r.nextWeight).toBe(65);
    expect(r.next.consecutiveFailures).toBe(0);
  });

  it('holds the weight on a single missed rep', () => {
    const r = applyProgression(lift(), sets([5, 5, 5, 5, 4]));
    expect(r.outcome).toBe('held');
    expect(r.nextWeight).toBe(60);
    expect(r.next.consecutiveFailures).toBe(1);
  });

  it('counts extra reps as a success', () => {
    const r = applyProgression(lift(), sets([6, 5, 5, 5, 5]));
    expect(r.outcome).toBe('progressed');
  });

  it('deloads 10% after three consecutive failures', () => {
    let state = lift();
    let result = applyProgression(state, sets([5, 5, 5, 5, 3]));
    expect(result.outcome).toBe('held');
    state = result.next;

    result = applyProgression(state, sets([5, 5, 5, 4, 3]));
    expect(result.outcome).toBe('held');
    expect(result.next.consecutiveFailures).toBe(2);
    state = result.next;

    result = applyProgression(state, sets([5, 5, 4, 3, 3]));
    expect(result.outcome).toBe('deloaded');
    expect(result.nextWeight).toBe(55); // 60 * 0.9 = 54 → rounded to the 2.5kg increment
    expect(result.next.deloads).toBe(1);
    expect(result.next.consecutiveFailures).toBe(0);
    expect(result.next.lastStallWeight).toBe(60);
  });

  it('resets the failure counter after a good session', () => {
    const missed = applyProgression(lift(), sets([5, 5, 5, 5, 2]));
    expect(missed.next.consecutiveFailures).toBe(1);
    const recovered = applyProgression(missed.next, sets([5, 5, 5, 5, 5]));
    expect(recovered.next.consecutiveFailures).toBe(0);
    expect(recovered.outcome).toBe('progressed');
  });

  it('never deloads below the minimum load of the lift', () => {
    // Empty bar: a 10% cut cannot make a lighter barbell, so it holds instead.
    const state = lift({ workingWeight: 20, consecutiveFailures: 2 });
    const r = applyProgression(state, sets([3, 3, 2], 5, 20));
    expect(r.outcome).toBe('held');
    expect(r.nextWeight).toBe(20);
    expect(r.next.deloads).toBe(0);
  });

  it('records a personal best only for completed sessions', () => {
    const good = applyProgression(lift({ workingWeight: 80 }), sets([5, 5, 5, 5, 5], 5, 80));
    expect(good.next.bestWeight).toBe(80);
    const bad = applyProgression(lift({ workingWeight: 100, bestWeight: 80 }), sets([2], 5, 100));
    expect(bad.next.bestWeight).toBe(80);
  });

  it('treats bodyweight movements as load-free', () => {
    const plank = lift({ exerciseId: 'plank', workingWeight: 0 });
    const r = applyProgression(plank, [{ targetReps: 30, reps: 45, weight: 0, completed: true }]);
    expect(r.nextWeight).toBe(0);
    expect(r.outcome).toBe('progressed');
  });

  it('ignores an empty set list rather than calling it a success', () => {
    expect(isSessionSuccessful([])).toBe(false);
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
