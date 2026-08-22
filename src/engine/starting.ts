import { getExercise } from '../data/exercises';
import { getProgram, PROGRAMS } from '../data/programs';
import { programExerciseIds } from './substitution';
import type { LiftState, Profile, Program } from '../types';
import { clamp, bmiBand, bmi, readBody } from './body';
import { noviceOneRepMax, oneRepMaxToReps } from './standards';
import { floorToIncrement, noSnap } from './plates';
import type { LoadSnapper } from './plates';

/**
 * The novice-standard 5RM this lifter is being aimed at, from their lean mass and age.
 * Not a starting weight — a target the linear progression will walk them up to.
 */
export function targetFiveRepMax(profile: Profile, exerciseId: string): number {
  const ex = getExercise(exerciseId);
  const oneRm = noviceOneRepMax(profile, ex.standard, ex.loadType);
  if (oneRm === 0) return 0;
  return oneRepMaxToReps(oneRm, 5);
}

/** True when the lift takes an external load the app can prescribe. */
export function isLoaded(exerciseId: string): boolean {
  return getExercise(exerciseId).standard.kind !== 'bodyweight';
}

/**
 * Where this lifter starts a given lift. Deliberately light: the first few weeks are for
 * learning the movement, and starting under your capacity is how linear progression buys
 * you months of easy gains instead of two weeks of them.
 */
export function startingWeight(
  profile: Profile,
  exerciseId: string,
  snap: LoadSnapper = noSnap,
): number {
  const ex = getExercise(exerciseId);
  const target = targetFiveRepMax(profile, exerciseId);
  if (target === 0) return 0;

  const body = readBody(profile);
  let weight = target * body.experienceFactor;

  // Very light lifters have less structural room to spare; very heavy ones carry a
  // smaller share of that bodyweight as usable muscle on the barbell lifts.
  if (body.band === 'under') weight *= 0.9;
  if (body.band === 'high') weight *= 0.92;

  // Round down to a load the gym can actually make — starting a beginner at a weight
  // their plates cannot build is the same bug as prescribing one mid-program.
  weight = snap(floorToIncrement(weight, ex.increment), ex, 'down');
  // Never below what the hardware can even make, and never above the standard itself.
  return clamp(weight, ex.minLoad, Math.max(ex.minLoad, target));
}

export function buildLiftStates(
  profile: Profile,
  programId: string,
  snap: LoadSnapper = noSnap,
  substitutions: Record<string, string> = {},
): Record<string, LiftState> {
  const program = getProgram(programId);
  const ids = new Set(programExerciseIds(program, substitutions));
  const lifts: Record<string, LiftState> = {};
  for (const id of ids) {
    const weight = startingWeight(profile, id, snap);
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
    .filter((l) => isLoaded(l.exerciseId))
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
  snap: LoadSnapper = noSnap,
): number {
  const ex = getExercise(exerciseId);
  if (!isLoaded(exerciseId)) return 0;

  const ratio = strengthRatio(lifts, profile);
  if (ratio === 0) return startingWeight(profile, exerciseId, snap);

  const target = targetFiveRepMax(profile, exerciseId);
  // Cap the multiplier: past roughly double the novice standard the lifter is no longer
  // a novice at all, and extrapolating further stops being safe.
  const weight = target * clamp(ratio, 0.3, 2) * 0.6;
  return clamp(snap(floorToIncrement(weight, ex.increment), ex, 'down'), ex.minLoad, target);
}

export interface ProgramRecommendation {
  program: Program;
  reasons: string[];
  alternatives: Program[];
  /** Set when the recommended program's schedule differs from the days the lifter asked for. */
  frequencyNote?: string;
  /** A program that does match the requested days, offered alongside the note. */
  frequencyMatch?: Program;
}

/** Whether this lifter can actually run a program with the equipment they have. */
function isRunnable(program: Program, profile: Profile): boolean {
  return !program.requires.includes('barbell') || profile.hasRack;
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

  const program = getProgram(id);

  // Never silently ignore the days the lifter said they had. If the recommendation runs on
  // a different schedule, say so, say why, and put a matching program within one tap.
  let frequencyNote: string | undefined;
  let frequencyMatch: Program | undefined;

  if (program.daysPerWeek !== profile.daysPerWeek) {
    frequencyMatch = PROGRAMS.find(
      (p) => p.id !== program.id && p.daysPerWeek === profile.daysPerWeek && isRunnable(p, profile),
    );

    if (profile.daysPerWeek > program.daysPerWeek) {
      frequencyNote =
        `You said you can train ${profile.daysPerWeek} days a week and ${program.name} runs ${program.daysPerWeek}. ` +
        'That is deliberate rather than an oversight: it works your whole body every session and adds weight ' +
        'every time, and a beginner recovers from three of those a week, not four. The spare day is better ' +
        'spent walking, sleeping and eating.';
      if (frequencyMatch) {
        frequencyNote += ` If you would rather use all ${profile.daysPerWeek}, ${frequencyMatch.name} is built for exactly that — it splits the work so no single session needs as much recovery.`;
      }
    } else {
      frequencyNote =
        `${program.name} is written as a ${program.daysPerWeek}-day week and you picked ${profile.daysPerWeek}. ` +
        'Nothing breaks — the app just rotates through the sessions in order, so each one comes round slower ' +
        'and progress is steadier rather than faster.';
      if (frequencyMatch) {
        frequencyNote += ` ${frequencyMatch.name} fits ${profile.daysPerWeek} days exactly, if you would rather stay on schedule.`;
      }
    }
  }

  return {
    program,
    reasons,
    // Surface a program matching the requested days first — it is the one they are most
    // likely to want after reading the note.
    alternatives: PROGRAMS.filter((p) => p.id !== id).sort(
      (a, b) =>
        Math.abs(a.daysPerWeek - profile.daysPerWeek) - Math.abs(b.daysPerWeek - profile.daysPerWeek),
    ),
    frequencyNote,
    frequencyMatch,
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
