import type { LoadType, Profile, Sex } from '../types';
import { leanBodyMass } from './body';

/**
 * Where the app's strength targets come from.
 *
 * Everything in this file is either a published constant or an explicitly-labelled
 * estimate. The three published pieces:
 *
 *  1. AGE — Foster (14–23) and McCulloch (40+) coefficients, the age-grading tables used
 *     in masters powerlifting. They exist to multiply an older or younger lifter's total
 *     up to a peak-age equivalent, so their reciprocal is the fraction of peak strength
 *     expected at that age. Peak is 24–39, where no adjustment applies.
 *  2. SIZE — strength scales with muscle cross-section, i.e. with mass^(2/3), not with
 *     mass. This is the allometric scaling law underlying Wilks/DOTS/Sinclair.
 *  3. LEVEL — novice one-rep-max standards as a multiple of bodyweight, from the
 *     aggregate lifting-standards tables (Strength Level and similar).
 *
 * The size term is applied to LEAN mass rather than bodyweight. That is deliberate: the
 * empirical curves fitted to competition bodyweight (DOTS et al.) show an exponent well
 * below 2/3, because heavier competitors carry proportionally more fat. Once fat is
 * removed by estimating lean mass, the geometric 2/3 exponent is the right one, and
 * applying the empirical curve as well would count the same correction twice.
 */

/** Bodyweight the published novice ratios below are quoted at. */
const REFERENCE_BODYWEIGHT_KG = 90;
/** Height paired with it to fix the reference lean mass. */
const REFERENCE_HEIGHT_CM = 178;
/** Muscle force tracks cross-sectional area, which scales as mass^(2/3). */
export const ALLOMETRIC_EXPONENT = 2 / 3;

export const REFERENCE_LEAN_MASS_KG = leanBodyMass('male', REFERENCE_BODYWEIGHT_KG, REFERENCE_HEIGHT_CM);

/**
 * Novice 1RM as a multiple of bodyweight for a male at the reference bodyweight.
 * "Novice" here means roughly three to six months of consistent training — the level a
 * beginner program is designed to deliver, not a starting point.
 */
export const NOVICE_BODYWEIGHT_RATIO: Record<string, number> = {
  squat: 1.25,
  bench: 0.75,
  deadlift: 1.5,
  ohp: 0.55,
};

/**
 * Sex difference remaining AFTER lean mass has been accounted for. Published tables put
 * women at roughly 75–85% of men on the lower-body lifts and 60–70% on upper body at the
 * same bodyweight; the lean-mass term already explains a few points of that, so these are
 * the residual and are slightly closer to 1 than the raw ratios.
 */
const SEX_RESIDUAL: Record<LoadType, number> = {
  lower: 0.8,
  upper: 0.65,
  accessory: 0.7,
  bodyweight: 1,
};

/** Foster age coefficients, USA Powerlifting — juniors, ages 14–23. */
const FOSTER: Record<number, number> = {
  14: 1.23, 15: 1.18, 16: 1.13, 17: 1.08, 18: 1.06,
  19: 1.04, 20: 1.03, 21: 1.02, 22: 1.01, 23: 1.0,
};

/** McCulloch age coefficients — masters, ages 40+. */
const MCCULLOCH: Record<number, number> = {
  40: 1.0, 41: 1.01, 42: 1.02, 43: 1.031, 44: 1.043, 45: 1.055, 46: 1.068, 47: 1.082,
  48: 1.097, 49: 1.113, 50: 1.13, 51: 1.147, 52: 1.165, 53: 1.184, 54: 1.204, 55: 1.225,
  56: 1.246, 57: 1.268, 58: 1.291, 59: 1.315, 60: 1.34, 61: 1.365, 62: 1.391, 63: 1.418,
  64: 1.446, 65: 1.475, 66: 1.511, 67: 1.543, 68: 1.576, 69: 1.61, 70: 1.645, 71: 1.681,
  72: 1.718, 73: 1.756, 74: 1.795, 75: 1.835, 76: 1.876, 77: 1.918, 78: 1.961, 79: 2.005,
  80: 2.05, 81: 2.096, 82: 2.143, 83: 2.19,
};

/**
 * Fraction of peak-age strength expected at a given age — the reciprocal of the
 * competition age-grading coefficient, since those exist to scale a total UP to a
 * peak-age equivalent.
 */
export function ageFactor(age: number): number {
  if (age >= 24 && age <= 39) return 1;

  if (age < 24) {
    const clamped = Math.max(14, Math.round(age));
    return 1 / (FOSTER[clamped] ?? FOSTER[14]);
  }

  const clamped = Math.min(83, Math.round(age));
  return 1 / (MCCULLOCH[clamped] ?? MCCULLOCH[83]);
}

/** How a lift's novice standard is derived, so provenance is visible in the data. */
export type StandardSource =
  /** A published novice bodyweight ratio. */
  | { kind: 'published'; lift: string }
  /** Our own estimate, expressed as a share of a lift that does have a published ratio. */
  | { kind: 'estimated'; of: string; fraction: number }
  /** Moves nothing but the lifter — no external load to prescribe. */
  | { kind: 'bodyweight' };

/**
 * Size term: how this lifter's frame compares with the reference body the published
 * ratios were quoted for. Lean mass is used so that height genuinely counts — two people
 * at the same weight but 25cm apart carry different amounts of muscle.
 */
export function sizeScale(profile: Profile): number {
  const lbm = leanBodyMass(profile.sex, profile.bodyweightKg, profile.heightCm);
  return Math.pow(lbm / REFERENCE_LEAN_MASS_KG, ALLOMETRIC_EXPONENT);
}

/** Novice 1RM for a lift with a published ratio, adjusted for this lifter. */
export function noviceOneRepMax(
  profile: Profile,
  source: StandardSource,
  loadType: LoadType,
): number {
  if (source.kind === 'bodyweight') return 0;

  const baseLift = source.kind === 'published' ? source.lift : source.of;
  const ratio = NOVICE_BODYWEIGHT_RATIO[baseLift];
  if (ratio === undefined) return 0;

  const absolute = ratio * REFERENCE_BODYWEIGHT_KG;
  const fraction = source.kind === 'estimated' ? source.fraction : 1;

  // The published ratios are male figures, so the residual applies to women only.
  const sexFactor = profile.sex === 'female' ? SEX_RESIDUAL[loadType] : 1;

  return absolute * fraction * sizeScale(profile) * sexFactor * ageFactor(profile.age);
}

/** Reps-to-1RM conversion, the inverse of the Epley estimate used elsewhere. */
export function oneRepMaxToReps(oneRm: number, reps: number): number {
  return oneRm / (1 + Math.min(reps, 12) / 30);
}

export function sexOf(profile: Profile): Sex {
  return profile.sex;
}
