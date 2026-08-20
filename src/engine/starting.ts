import { getExercise } from '../data/exercises';
import { getProgram, PROGRAMS } from '../data/programs';
import type { LiftState, Profile, Program } from '../types';
import { readBody, clamp, bmiBand, bmi } from './body';
import { floorToIncrement } from './plates';

/**
 * The novice-standard 5RM this lifter is being aimed at, from their lean mass and age.
 * Not a starting weight — a target the linear progression will walk them up to.
 */
export function targetFiveRepMax(profile: Profile, exerciseId: string): number {
  const ex = getExercise(exerciseId);
  if (ex.lbmRatio === 0) return 0;
  const body = readBody(profile);
  return body.lbm * ex.lbmRatio * body.ageFactor;
}

/**
 * Where this lifter starts a given lift. Deliberately light: the first few weeks are for
 * learning the movement, and starting under your capacity is how linear progression buys
 * you months of easy gains instead of two weeks of them.
 */
export function startingWeight(profile: Profile, exerciseId: string): number {
  const ex = getExercise(exerciseId);
  if (ex.lbmRatio === 0) return 0;

  const body = readBody(profile);
  let weight = targetFiveRepMax(profile, exerciseId) * body.experienceFactor;

  // Very light lifters have less structural room to spare; very heavy ones carry a
  // smaller share of that bodyweight as usable muscle on the barbell lifts.
  if (body.band === 'under') weight *= 0.9;
  if (body.band === 'high') weight *= 0.92;

  weight = floorToIncrement(weight, ex.increment);
  // Never below what the hardware can even make, and never above the standard itself.
  return clamp(weight, ex.minLoad, Math.max(ex.minLoad, targetFiveRepMax(profile, exerciseId)));
}

export function buildLiftStates(profile: Profile, programId: string): Record<string, LiftState> {
  const program = getProgram(programId);
  const ids = new Set(program.days.flatMap((d) => d.slots.map((s) => s.exerciseId)));
  const lifts: Record<string, LiftState> = {};
  for (const id of ids) {
    const weight = startingWeight(profile, id);
    lifts[id] = {
      exerciseId: id,
      workingWeight: weight,
      consecutiveFailures: 0,
      deloads: 0,
      bestWeight: 0,
      bestEstimated1RM: 0,
    };
  }
  return lifts;
}

/**
 * How far ahead of (or behind) their novice standard the lifter currently is, from the
 * lifts they have actually been training. Median rather than mean so one runaway lift
 * does not drag the estimate.
 */
export function strengthRatio(lifts: Record<string, LiftState>, profile: Profile): number {
  const ratios = Object.values(lifts)
    .filter((l) => getExercise(l.exerciseId).lbmRatio > 0)
    .map((l) => {
      const target = targetFiveRepMax(profile, l.exerciseId);
      return target > 0 ? Math.max(l.bestWeight, l.workingWeight) / target : 0;
    })
    .filter((r) => r > 0)
    .sort((a, b) => a - b);

  if (ratios.length === 0) return 0;
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

/**
 * Starting weight for a movement the lifter has never done, on a program change.
 * Using the day-one estimate here would hand someone six months into training an
 * insultingly light first set, so this scales off what they can currently lift and then
 * backs off — the movement is still new, and linear progression will close the gap fast.
 */
export function seedNewLift(
  lifts: Record<string, LiftState>,
  profile: Profile,
  exerciseId: string,
): number {
  const ex = getExercise(exerciseId);
  if (ex.lbmRatio === 0) return 0;

  const ratio = strengthRatio(lifts, profile);
  if (ratio === 0) return startingWeight(profile, exerciseId);

  const target = targetFiveRepMax(profile, exerciseId);
  // Cap the multiplier: past roughly double the novice standard the lifter is no longer
  // a novice at all, and extrapolating further stops being safe.
  const weight = target * clamp(ratio, 0.3, 2) * 0.6;
  return clamp(floorToIncrement(weight, ex.increment), ex.minLoad, target);
}

export interface ProgramRecommendation {
  program: Program;
  reasons: string[];
  alternatives: Program[];
}

/**
 * Picks the starting program from the profile. Barbell work is the fastest route for a
 * healthy adult beginner, but there are a few situations where starting on machines is
 * plainly the better call — no rack, no experience at an age where a missed rep hurts
 * more, or a bodyweight that makes loaded spinal work unpleasant on week one.
 */
export function recommendProgram(profile: Profile): ProgramRecommendation {
  const reasons: string[] = [];
  const band = bmiBand(bmi(profile.bodyweightKg, profile.heightCm));
  let id = 'strength-5x5';

  if (!profile.hasRack) {
    id = 'foundation';
    reasons.push('Your gym has no squat rack, so the barbell program is off the table for now.');
  } else if (profile.experience === 'never' && profile.age >= 50) {
    id = 'foundation';
    reasons.push('Starting from zero at 50+ — a few weeks on machines builds the base with far less that can go wrong.');
  } else if (profile.experience === 'never' && band === 'high') {
    id = 'foundation';
    reasons.push('Machines and dumbbells first: they load the muscle without loading your spine and knees the way a back squat does.');
  } else if (profile.experience === 'never' && band === 'under') {
    id = 'strength-5x5';
    reasons.push('You are light for your height — barbell work plus eating properly is the fastest way to put on real mass.');
  }

  if (id === 'strength-5x5') {
    if (profile.experience === 'returning') reasons.push('You have lifted before, so you can skip the on-ramp and go straight to the barbell.');
    else if (reasons.length === 0) reasons.push('You have a rack and no reason to wait — the barbell lifts give a beginner the most strength per hour spent.');
  }

  // A lifter with four days available and prior experience is better served by Upper/Lower.
  if (id === 'strength-5x5' && profile.daysPerWeek >= 4 && profile.experience === 'returning') {
    id = 'upper-lower';
    reasons.push('Four days a week and prior training means you can handle the extra volume of an Upper/Lower split.');
  }

  if (profile.daysPerWeek <= 2) {
    reasons.push(`You picked ${profile.daysPerWeek} days a week — the program still works, each session just comes round slower.`);
  }

  return {
    program: getProgram(id),
    reasons,
    alternatives: PROGRAMS.filter((p) => p.id !== id),
  };
}

/** Personal notes that fall out of the lifter's build, shown once at onboarding. */
export function buildNotes(profile: Profile): string[] {
  const notes: string[] = [];
  const body = readBody(profile);

  notes.push(
    `Estimated lean mass ${body.lbm.toFixed(1)}kg — your starting weights are set from this, not from the scale.`,
  );

  if (body.band === 'under') {
    notes.push('Your BMI is under 18.5. Strength will come slowly unless you eat more than you think you need — aim for a surplus.');
  } else if (body.band === 'high') {
    notes.push('Carrying extra weight is an advantage on the lower-body lifts and a disadvantage on anything where you move your own body.');
  }

  if (profile.heightCm >= 188) {
    notes.push('At your height the bar travels further on every rep, so your lifts will look lower than a shorter lifter at the same bodyweight. That is leverage, not weakness.');
  } else if (profile.heightCm <= 165) {
    notes.push('Short levers are a real advantage on the press and bench — expect those to climb quickly.');
  }

  if (profile.age >= 45) {
    notes.push('Over 45, recovery is the limiting factor rather than effort. Take the deloads when the app offers them.');
  }

  return notes;
}
