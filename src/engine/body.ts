import type { Profile, Sex } from '../types';

/**
 * Lean body mass, Boer formula. This is the reason onboarding asks for height as well as
 * weight: strength tracks how much muscle you carry, and two people at the same bodyweight
 * carry very different amounts of it depending on how tall they are.
 */
export function leanBodyMass(sex: Sex, weightKg: number, heightCm: number): number {
  const lbm =
    sex === 'male'
      ? 0.407 * weightKg + 0.267 * heightCm - 19.2
      : 0.252 * weightKg + 0.473 * heightCm - 48.3;
  // The formula drifts at the extremes; clamp to a plausible share of bodyweight.
  return clamp(lbm, weightKg * 0.35, weightKg * 0.92);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiBand(value: number): 'under' | 'healthy' | 'over' | 'high' {
  if (value < 18.5) return 'under';
  if (value < 25) return 'healthy';
  if (value < 30) return 'over';
  return 'high';
}

/**
 * Strength peaks in the 20s and declines slowly. Under-18s are still developing, so they
 * start lighter regardless of how strong they feel.
 */
export function ageFactor(age: number): number {
  if (age < 18) return 0.8;
  if (age <= 30) return 1;
  return clamp(1 - (age - 30) * 0.006, 0.65, 1);
}

/** How close to a novice standard we dare start someone. */
export function experienceFactor(experience: Profile['experience']): number {
  switch (experience) {
    case 'never':
      return 0.45;
    case 'some':
      return 0.6;
    case 'returning':
      return 0.72;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export interface BodyReadout {
  lbm: number;
  bmi: number;
  band: ReturnType<typeof bmiBand>;
  ageFactor: number;
  experienceFactor: number;
}

export function readBody(profile: Profile): BodyReadout {
  const value = bmi(profile.bodyweightKg, profile.heightCm);
  return {
    lbm: leanBodyMass(profile.sex, profile.bodyweightKg, profile.heightCm),
    bmi: value,
    band: bmiBand(value),
    ageFactor: ageFactor(profile.age),
    experienceFactor: experienceFactor(profile.experience),
  };
}
