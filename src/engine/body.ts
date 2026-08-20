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

/** How close to a novice standard we dare start someone. */
export function experienceFactor(experience: Profile['experience']): number {
  switch (experience) {
    case 'never':
      return 0.4;
    case 'some':
      return 0.55;
    case 'returning':
      return 0.68;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

// Pure body composition only. Age and strength scaling live in ./standards, which
// imports this module — keeping the dependency one-directional.
export interface BodyReadout {
  lbm: number;
  bmi: number;
  band: ReturnType<typeof bmiBand>;
  experienceFactor: number;
}

export function readBody(profile: Profile): BodyReadout {
  const value = bmi(profile.bodyweightKg, profile.heightCm);
  return {
    lbm: leanBodyMass(profile.sex, profile.bodyweightKg, profile.heightCm),
    bmi: value,
    band: bmiBand(value),
    experienceFactor: experienceFactor(profile.experience),
  };
}
