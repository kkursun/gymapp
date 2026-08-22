import { getExercise } from '../data/exercises';
import type { Exercise, LoggedSet } from '../types';
import { noSnap } from './plates';
import type { LoadSnapper } from './plates';

/**
 * Ramp-up sets.
 *
 * A beginner program will happily walk someone to a 90kg squat, and the app used to send
 * them straight into set one at 90kg from cold. Every serious lifting program ramps: a
 * few progressively heavier sets that rehearse the movement and wake the muscle up
 * without adding meaningful fatigue.
 *
 * Warm-ups are computed rather than stored in the program data, because they depend on
 * the weight the lifter is on today and on the plates their gym owns. They are kept in a
 * separate list from the working sets and are never shown to the progression engine —
 * missing a warm-up is not a failed session.
 */

/**
 * Fractions of the working weight, with the reps to do at each. Light and short on
 * purpose: this is preparation, not training, and every rep here is one not spent on the
 * sets that count.
 */
const RAMP: { fraction: number; reps: number }[] = [
  { fraction: 0.55, reps: 5 },
  { fraction: 0.75, reps: 3 },
  { fraction: 0.9, reps: 2 },
];

/** Below this multiple of the empty bar there is nothing to ramp up to. */
const WORTH_RAMPING = 1.3;

export interface WarmupStep {
  weight: number;
  reps: number;
}

export interface WarmupOptions {
  barKg: number;
  snap?: LoadSnapper;
}

/**
 * The ramp for one lift at one working weight. Empty when a warm-up would be pointless:
 * bodyweight movements, isolation work, and anything already close to the lightest load
 * the equipment makes.
 */
export function warmupPlan(
  exercise: Exercise | string,
  workingWeight: number,
  opts: WarmupOptions,
): WarmupStep[] {
  const ex = typeof exercise === 'string' ? getExercise(exercise) : exercise;
  const snap = opts.snap ?? noSnap;

  // Curls and face pulls do not need a ramp, and neither does anything unloaded.
  if (ex.standard.kind === 'bodyweight') return [];
  if (ex.loadType === 'accessory') return [];

  // The lightest the lift can start from: the bar itself, or the lightest dumbbell or
  // stack pin for everything else.
  const base = ex.equipment === 'barbell' ? Math.max(opts.barKg, ex.minLoad) : ex.minLoad;
  if (workingWeight <= base * WORTH_RAMPING) return [];

  const steps: WarmupStep[] = [{ weight: base, reps: 5 }];

  for (const { fraction, reps } of RAMP) {
    // Down, never up: a warm-up must stay lighter than the work it is preparing for.
    const weight = snap(roundHalf(workingWeight * fraction), ex, 'down');
    const previous = steps[steps.length - 1].weight;
    // Skip a rung the equipment cannot separate from the one below it, and never let the
    // ramp reach the working weight itself.
    if (weight <= previous || weight >= workingWeight) continue;
    steps.push({ weight, reps });
  }

  // A single set at the empty bar is not a ramp, it is just an empty bar.
  return steps.length > 1 ? steps : [];
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** The ramp as loggable sets, ready to drop into a session. */
export function buildWarmupSets(
  exercise: Exercise | string,
  workingWeight: number,
  opts: WarmupOptions,
): LoggedSet[] {
  return warmupPlan(exercise, workingWeight, opts).map((step) => ({
    targetReps: step.reps,
    reps: step.reps,
    weight: step.weight,
    completed: false,
  }));
}

/**
 * Rest between warm-up sets. Deliberately short and not user-configurable: resting three
 * minutes after the empty bar is how a 45-minute session becomes a 90-minute one.
 */
export const WARMUP_REST_SEC = 45;
