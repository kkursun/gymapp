import { describe, expect, it } from 'vitest';
import { bmi, bmiBand, leanBodyMass } from '../body';
import { ageFactor } from '../standards';
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

  it('follows the published age-grading coefficients', () => {
    // Peak is 24-39 in both the Foster and McCulloch schemes: no adjustment applies.
    expect(ageFactor(24)).toBe(1);
    expect(ageFactor(30)).toBe(1);
    expect(ageFactor(39)).toBe(1);
    expect(ageFactor(40)).toBe(1);

    // Masters: the reciprocal of the McCulloch coefficient for that age.
    expect(ageFactor(50)).toBeCloseTo(1 / 1.13, 4);
    expect(ageFactor(60)).toBeCloseTo(1 / 1.34, 4);
    expect(ageFactor(70)).toBeCloseTo(1 / 1.645, 4);
    expect(ageFactor(83)).toBeCloseTo(1 / 2.19, 4);

    // Juniors: the reciprocal of the Foster coefficient.
    expect(ageFactor(16)).toBeCloseTo(1 / 1.13, 4);
    expect(ageFactor(18)).toBeCloseTo(1 / 1.06, 4);
    expect(ageFactor(23)).toBe(1);
  });

  it('is monotonically decreasing once past peak, and clamps at the table edges', () => {
    for (let age = 40; age < 83; age++) {
      expect(ageFactor(age)).toBeGreaterThan(ageFactor(age + 1));
    }
    // Beyond the published tables the nearest coefficient is held rather than extrapolated.
    expect(ageFactor(95)).toBe(ageFactor(83));
    expect(ageFactor(12)).toBe(ageFactor(14));
  });

  it('rises through the teens as a junior matures', () => {
    for (let age = 14; age < 23; age++) {
      expect(ageFactor(age)).toBeLessThan(ageFactor(age + 1));
    }
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

describe('honouring the requested training days', () => {
  it('explains itself when the recommendation runs fewer days than requested', () => {
    const rec = recommendProgram(profile({ daysPerWeek: 4, experience: 'never' }));
    // A novice is still best served by 3 full-body days...
    expect(rec.program.id).toBe('strength-5x5');
    expect(rec.program.daysPerWeek).toBe(3);
    // ...but the answer they gave must not be silently discarded.
    expect(rec.frequencyNote).toBeDefined();
    expect(rec.frequencyNote).toContain('4 days a week');
    expect(rec.frequencyMatch?.id).toBe('upper-lower');
  });

  it('says nothing about frequency when the program already matches', () => {
    const rec = recommendProgram(profile({ daysPerWeek: 3 }));
    expect(rec.program.daysPerWeek).toBe(3);
    expect(rec.frequencyNote).toBeUndefined();
    expect(rec.frequencyMatch).toBeUndefined();
  });

  it('explains the other direction too, when the program runs more days than requested', () => {
    const rec = recommendProgram(profile({ daysPerWeek: 3, experience: 'returning' }));
    expect(rec.program.id).toBe('strength-5x5');
    expect(rec.frequencyNote).toBeUndefined();

    // A returning lifter on 4 days gets Upper/Lower; force the mismatch the other way.
    const slower = recommendProgram(profile({ daysPerWeek: 2, experience: 'returning' }));
    expect(slower.frequencyNote).toContain('comes round slower');
  });

  it('never offers a barbell program as the frequency match without a rack', () => {
    const rec = recommendProgram(profile({ daysPerWeek: 4, hasRack: false }));
    expect(rec.program.id).toBe('foundation');
    // Upper/Lower needs a barbell, so it must not be the suggested 4-day alternative.
    expect(rec.frequencyMatch).toBeUndefined();
  });

  it('lists a program matching the requested days first among the alternatives', () => {
    const rec = recommendProgram(profile({ daysPerWeek: 4, experience: 'never' }));
    expect(rec.alternatives[0].daysPerWeek).toBe(4);
  });
});
