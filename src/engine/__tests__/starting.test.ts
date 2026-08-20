import { describe, expect, it } from 'vitest';
import { ageFactor, bmi, bmiBand, leanBodyMass } from '../body';
import { buildLiftStates, recommendProgram, seedNewLift, startingWeight, strengthRatio, targetFiveRepMax } from '../starting';
import { getExercise } from '../../data/exercises';
import type { Profile } from '../../types';

const profile = (over: Partial<Profile> = {}): Profile => ({
  name: 'Test',
  sex: 'male',
  age: 28,
  heightCm: 178,
  bodyweightKg: 78,
  experience: 'never',
  daysPerWeek: 3,
  hasRack: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('body metrics', () => {
  it('computes lean mass from both height and weight', () => {
    const short = leanBodyMass('male', 80, 165);
    const tall = leanBodyMass('male', 80, 190);
    // Same weight, more height means more of it is lean mass.
    expect(tall).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(30);
  });

  it('keeps lean mass a plausible share of bodyweight at the extremes', () => {
    const extreme = leanBodyMass('female', 40, 200);
    expect(extreme).toBeLessThanOrEqual(40 * 0.92);
    expect(extreme).toBeGreaterThanOrEqual(40 * 0.35);
  });

  it('bands BMI', () => {
    expect(bmiBand(bmi(50, 180))).toBe('under');
    expect(bmiBand(bmi(75, 180))).toBe('healthy');
    expect(bmiBand(bmi(88, 180))).toBe('over');
    expect(bmiBand(bmi(105, 180))).toBe('high');
  });

  it('tapers strength expectations with age but never off a cliff', () => {
    expect(ageFactor(25)).toBe(1);
    expect(ageFactor(16)).toBe(0.8);
    expect(ageFactor(50)).toBeLessThan(1);
    expect(ageFactor(90)).toBeGreaterThanOrEqual(0.65);
  });
});

describe('starting weights', () => {
  it('scales with the lifter, not with a fixed table', () => {
    const small = startingWeight(profile({ bodyweightKg: 55, heightCm: 160 }), 'squat');
    const large = startingWeight(profile({ bodyweightKg: 95, heightCm: 190 }), 'squat');
    expect(large).toBeGreaterThan(small);
  });

  it('never prescribes less than the hardware can make', () => {
    const tiny = profile({ bodyweightKg: 42, heightCm: 150, sex: 'female', age: 60 });
    for (const id of ['squat', 'bench', 'deadlift', 'ohp', 'row']) {
      expect(startingWeight(tiny, id)).toBeGreaterThanOrEqual(getExercise(id).minLoad);
    }
  });

  it('starts everyone below their own novice standard', () => {
    for (const p of [profile(), profile({ experience: 'returning' }), profile({ sex: 'female', age: 45 })]) {
      for (const id of ['squat', 'bench', 'deadlift']) {
        expect(startingWeight(p, id)).toBeLessThanOrEqual(targetFiveRepMax(p, id));
      }
    }
  });

  it('starts an experienced lifter heavier than a complete beginner', () => {
    const beginner = startingWeight(profile({ experience: 'never' }), 'bench');
    const returning = startingWeight(profile({ experience: 'returning' }), 'bench');
    expect(returning).toBeGreaterThan(beginner);
  });

  it('lands on weights the plates can actually make', () => {
    const w = startingWeight(profile({ bodyweightKg: 83, heightCm: 181 }), 'squat');
    expect(w % 2.5).toBeCloseTo(0, 5);
    const dl = startingWeight(profile({ bodyweightKg: 83, heightCm: 181 }), 'deadlift');
    expect(dl % 5).toBeCloseTo(0, 5);
  });

  it('seeds every lift in the chosen program', () => {
    const lifts = buildLiftStates(profile(), 'strength-5x5');
    expect(Object.keys(lifts).sort()).toEqual(['bench', 'deadlift', 'ohp', 'row', 'squat']);
    expect(Object.values(lifts).every((l) => l.consecutiveFailures === 0 && l.deloads === 0)).toBe(true);
  });
});

describe('program recommendation', () => {
  it('puts a healthy adult beginner with a rack on the barbell', () => {
    expect(recommendProgram(profile()).program.id).toBe('strength-5x5');
  });

  it('falls back to machines when there is no rack', () => {
    const rec = recommendProgram(profile({ hasRack: false }));
    expect(rec.program.id).toBe('foundation');
    expect(rec.reasons.join(' ')).toMatch(/rack/i);
  });

  it('eases an older complete beginner in on machines', () => {
    expect(recommendProgram(profile({ age: 58, experience: 'never' })).program.id).toBe('foundation');
  });

  it('eases a high-BMI complete beginner in on machines', () => {
    expect(recommendProgram(profile({ bodyweightKg: 130, heightCm: 175 })).program.id).toBe('foundation');
  });

  it('sends an experienced 4-day lifter straight to upper/lower', () => {
    expect(recommendProgram(profile({ experience: 'returning', daysPerWeek: 4 })).program.id).toBe('upper-lower');
  });

  it('always explains itself', () => {
    for (const p of [profile(), profile({ hasRack: false }), profile({ age: 60 }), profile({ daysPerWeek: 2 })]) {
      expect(recommendProgram(p).reasons.length).toBeGreaterThan(0);
    }
  });
});

describe('seeding a lift the lifter has never done', () => {
  const p = profile();

  it('falls back to the body estimate when there is no training history', () => {
    const lifts = buildLiftStates(p, 'strength-5x5');
    // Untouched lifts still sit at their day-one starting weight, so the ratio is honest.
    expect(seedNewLift(lifts, p, 'leg-press')).toBeGreaterThan(0);
  });

  it('scales a new movement off demonstrated strength, not day one', () => {
    const novice = buildLiftStates(p, 'strength-5x5');
    const advanced = Object.fromEntries(
      Object.entries(novice).map(([id, l]) => [id, { ...l, workingWeight: l.workingWeight * 3, bestWeight: l.workingWeight * 3 }]),
    );
    expect(seedNewLift(advanced, p, 'romanian-deadlift')).toBeGreaterThan(
      seedNewLift(novice, p, 'romanian-deadlift'),
    );
  });

  it('never seeds above the lifters own novice standard for that movement', () => {
    const silly = Object.fromEntries(
      Object.entries(buildLiftStates(p, 'strength-5x5')).map(([id, l]) => [id, { ...l, bestWeight: 900 }]),
    );
    for (const id of ['romanian-deadlift', 'leg-press', 'db-curl']) {
      expect(seedNewLift(silly, p, id)).toBeLessThanOrEqual(targetFiveRepMax(p, id));
      expect(seedNewLift(silly, p, id)).toBeGreaterThanOrEqual(getExercise(id).minLoad);
    }
  });

  it('gives bodyweight movements no load', () => {
    expect(seedNewLift(buildLiftStates(p, 'strength-5x5'), p, 'plank')).toBe(0);
  });

  it('reads the strength ratio off the trained lifts', () => {
    const lifts = buildLiftStates(p, 'strength-5x5');
    const atStandard = Object.fromEntries(
      Object.entries(lifts).map(([id, l]) => [id, { ...l, bestWeight: targetFiveRepMax(p, id) }]),
    );
    expect(strengthRatio(atStandard, p)).toBeCloseTo(1, 1);
    expect(strengthRatio({}, p)).toBe(0);
  });
});
