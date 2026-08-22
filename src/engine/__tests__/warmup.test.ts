import { describe, expect, it } from 'vitest';
import { getExercise } from '../../data/exercises';
import { buildWarmupSets, warmupPlan } from '../warmup';
import { makeSnapper, platesFor } from '../plates';

const STANDARD = { barKg: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };
const opts = (bar = STANDARD) => ({ barKg: bar.barKg, snap: makeSnapper(bar) });

describe('warmupPlan', () => {
  it('ramps a heavy barbell lift from the empty bar upward', () => {
    const plan = warmupPlan('squat', 100, opts());
    expect(plan.length).toBeGreaterThan(1);
    expect(plan[0].weight).toBe(20);
    const weights = plan.map((p) => p.weight);
    expect([...weights].sort((a, b) => a - b)).toEqual(weights);
  });

  it('never reaches the working weight', () => {
    for (const w of [60, 82.5, 100, 140]) {
      for (const step of warmupPlan('squat', w, opts())) {
        expect(step.weight).toBeLessThan(w);
      }
    }
  });

  it('drops reps as the bar gets heavier', () => {
    const plan = warmupPlan('deadlift', 120, opts());
    const reps = plan.map((p) => p.reps);
    expect([...reps].sort((a, b) => b - a)).toEqual(reps);
  });

  it('only ever prescribes loads the gym can actually build', () => {
    const bar = { barKg: 20, plates: [25, 20, 15, 10, 5, 2.5] };
    for (const w of [55, 62.5, 87.5, 105]) {
      for (const step of warmupPlan('squat', w, opts(bar))) {
        expect(platesFor(step.weight, bar.barKg, bar.plates).remainder).toBe(0);
      }
    }
  });

  it('skips the ramp for a lift already at the empty bar', () => {
    expect(warmupPlan('squat', 20, opts())).toEqual([]);
    expect(warmupPlan('bench', 22.5, opts())).toEqual([]);
  });

  it('skips bodyweight movements — there is nothing to ramp', () => {
    expect(warmupPlan('plank', 0, opts())).toEqual([]);
    expect(warmupPlan('hanging-knee-raise', 0, opts())).toEqual([]);
  });

  it('skips isolation work, which does not need ramping', () => {
    expect(warmupPlan('db-curl', 20, opts())).toEqual([]);
    expect(warmupPlan('face-pull', 30, opts())).toEqual([]);
    expect(warmupPlan('triceps-pushdown', 40, opts())).toEqual([]);
  });

  it('ramps dumbbell and machine compounds from their lightest load', () => {
    const plan = warmupPlan('leg-press', 120, opts());
    expect(plan.length).toBeGreaterThan(1);
    expect(plan[0].weight).toBe(getExercise('leg-press').minLoad);
  });

  it('never emits a lone empty-bar set', () => {
    for (let w = 20; w <= 200; w += 2.5) {
      const plan = warmupPlan('squat', w, opts());
      expect(plan.length === 0 || plan.length > 1).toBe(true);
    }
  });

  it('never repeats a weight', () => {
    for (let w = 20; w <= 200; w += 2.5) {
      const weights = warmupPlan('squat', w, opts()).map((p) => p.weight);
      expect(new Set(weights).size).toBe(weights.length);
    }
  });

  it('builds loggable sets that start un-ticked', () => {
    const sets = buildWarmupSets('squat', 100, opts());
    expect(sets.length).toBeGreaterThan(1);
    expect(sets.every((s) => !s.completed)).toBe(true);
    expect(sets.every((s) => s.reps === s.targetReps)).toBe(true);
  });
});
