import { describe, expect, it } from 'vitest';
import {
  ALLOMETRIC_EXPONENT,
  NOVICE_BODYWEIGHT_RATIO,
  REFERENCE_LEAN_MASS_KG,
  noviceOneRepMax,
  sizeScale,
} from '../standards';
import { getExercise } from '../../data/exercises';
import { targetFiveRepMax } from '../starting';
import { leanBodyMass } from '../body';
import type { Profile } from '../../types';

const p = (o: Partial<Profile> = {}): Profile => ({
  name: 'x',
  sex: 'male',
  age: 30,
  heightCm: 178,
  bodyweightKg: 78,
  experience: 'never',
  daysPerWeek: 3,
  hasRack: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...o,
});

const oneRm = (profile: Profile, id: string) => {
  const ex = getExercise(id);
  return noviceOneRepMax(profile, ex.standard, ex.loadType);
};

/** The reference body the published ratios are quoted against. */
const REFERENCE = p({ bodyweightKg: 90, heightCm: 178, age: 30, sex: 'male' });

describe('anchoring to the published standards', () => {
  it('reproduces the published novice ratios exactly at the reference body', () => {
    expect(sizeScale(REFERENCE)).toBeCloseTo(1, 10);
    for (const [lift, ratio] of Object.entries(NOVICE_BODYWEIGHT_RATIO)) {
      expect(oneRm(REFERENCE, lift)).toBeCloseTo(ratio * 90, 6);
    }
  });

  it('places a mid-sized male novice at sensible bodyweight ratios', () => {
    const lifter = p({ bodyweightKg: 78 });
    // Lighter than the reference, so ratios sit above the 90kg anchors.
    expect(oneRm(lifter, 'squat') / 78).toBeGreaterThan(1.25);
    expect(oneRm(lifter, 'squat') / 78).toBeLessThan(1.6);
    expect(oneRm(lifter, 'deadlift') / 78).toBeGreaterThan(1.5);
    expect(oneRm(lifter, 'deadlift') / 78).toBeLessThan(1.9);
    expect(oneRm(lifter, 'bench') / 78).toBeGreaterThan(0.75);
    expect(oneRm(lifter, 'bench') / 78).toBeLessThan(1.0);
  });

  it('orders the big lifts the way every standards table does', () => {
    const lifter = p();
    expect(oneRm(lifter, 'deadlift')).toBeGreaterThan(oneRm(lifter, 'squat'));
    expect(oneRm(lifter, 'squat')).toBeGreaterThan(oneRm(lifter, 'bench'));
    expect(oneRm(lifter, 'bench')).toBeGreaterThan(oneRm(lifter, 'ohp'));
  });
});

describe('scaling with body size', () => {
  it('scales with the 2/3 power of lean mass, not linearly', () => {
    const small = p({ bodyweightKg: 60, heightCm: 170 });
    const large = p({ bodyweightKg: 100, heightCm: 170 });
    const lbmRatio =
      leanBodyMass('male', 100, 170) / leanBodyMass('male', 60, 170);
    const strengthRatio = oneRm(large, 'squat') / oneRm(small, 'squat');

    expect(strengthRatio).toBeCloseTo(Math.pow(lbmRatio, ALLOMETRIC_EXPONENT), 4);
    // The crucial consequence: strength grows more slowly than size.
    expect(strengthRatio).toBeLessThan(lbmRatio);
  });

  it('makes a heavier lifter stronger in absolute terms but weaker per kilo', () => {
    const light = p({ bodyweightKg: 65 });
    const heavy = p({ bodyweightKg: 105 });
    expect(oneRm(heavy, 'squat')).toBeGreaterThan(oneRm(light, 'squat'));
    expect(oneRm(heavy, 'squat') / 105).toBeLessThan(oneRm(light, 'squat') / 65);
  });

  it('expects more of a taller lifter at the same bodyweight', () => {
    const short = p({ heightCm: 165 });
    const tall = p({ heightCm: 195 });
    expect(oneRm(tall, 'squat')).toBeGreaterThan(oneRm(short, 'squat'));
    // But height is a secondary effect, not a dominant one.
    expect(oneRm(tall, 'squat') / oneRm(short, 'squat')).toBeLessThan(1.2);
  });

  it('agrees with the DOTS curve on how strength grows with bodyweight', () => {
    // DOTS is a 4th-degree polynomial fitted to competition results; its denominator is
    // proportional to expected total at a given bodyweight. Our model is derived quite
    // differently (lean mass, geometric scaling), so agreeing to within 20% across the
    // normal range is a meaningful independent check rather than a tautology.
    const dotsDenominator = (bw: number) =>
      -0.000001093 * bw ** 4 +
      0.0007391293 * bw ** 3 -
      0.1918759221 * bw ** 2 +
      24.0900756 * bw -
      307.75076;

    for (const [lo, hi] of [[60, 90], [70, 110], [80, 120]]) {
      const ours = oneRm(p({ bodyweightKg: hi }), 'squat') / oneRm(p({ bodyweightKg: lo }), 'squat');
      const dots = dotsDenominator(hi) / dotsDenominator(lo);
      expect(Math.abs(ours - dots) / dots).toBeLessThan(0.2);
      // Both must agree that bigger means stronger.
      expect(ours).toBeGreaterThan(1);
    }
  });
});

describe('sex differences', () => {
  // Published tables put women at roughly 75-85% of men on lower-body lifts and 60-70%
  // on upper body, at the same bodyweight. Our lean-mass term explains part of that gap
  // on its own, so this checks the COMBINED result lands where the tables say.
  const male = p({ sex: 'male', bodyweightKg: 70, heightCm: 170 });
  const female = p({ sex: 'female', bodyweightKg: 70, heightCm: 170 });

  it('lands inside the published band on lower-body lifts', () => {
    for (const lift of ['squat', 'deadlift']) {
      const ratio = oneRm(female, lift) / oneRm(male, lift);
      expect(ratio).toBeGreaterThan(0.72);
      expect(ratio).toBeLessThan(0.86);
    }
  });

  it('lands inside the published band on upper-body lifts', () => {
    for (const lift of ['bench', 'ohp']) {
      const ratio = oneRm(female, lift) / oneRm(male, lift);
      expect(ratio).toBeGreaterThan(0.57);
      expect(ratio).toBeLessThan(0.71);
    }
  });

  it('keeps the upper-body gap wider than the lower-body gap', () => {
    const lower = oneRm(female, 'squat') / oneRm(male, 'squat');
    const upper = oneRm(female, 'bench') / oneRm(male, 'bench');
    expect(upper).toBeLessThan(lower);
  });
});

describe('derived lifts', () => {
  it('keeps estimated lifts in a sane relationship to their published anchor', () => {
    const lifter = p();
    // A row is trained lighter than a bench; a leg press is far heavier than a squat.
    expect(oneRm(lifter, 'row')).toBeLessThan(oneRm(lifter, 'bench'));
    expect(oneRm(lifter, 'leg-press')).toBeGreaterThan(oneRm(lifter, 'squat'));
    // Per-hand dumbbell figures must be well under the two-handed barbell lift.
    expect(oneRm(lifter, 'db-bench')).toBeLessThan(oneRm(lifter, 'bench') * 0.5);
    expect(oneRm(lifter, 'db-shoulder-press')).toBeLessThan(oneRm(lifter, 'ohp') * 0.5);
  });

  it('gives bodyweight movements no prescribed load', () => {
    expect(oneRm(p(), 'plank')).toBe(0);
    expect(targetFiveRepMax(p(), 'hanging-knee-raise')).toBe(0);
  });

  it('exposes the reference lean mass it was calibrated against', () => {
    expect(REFERENCE_LEAN_MASS_KG).toBeCloseTo(leanBodyMass('male', 90, 178), 10);
  });
});
