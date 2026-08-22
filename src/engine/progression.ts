import { getExercise } from '../data/exercises';
import type { LiftState, LoadType, LoggedSet, SetScheme } from '../types';
import { roundToIncrement } from './plates';

/** Sessions in a row you may miss a lift before the app pulls the weight back. */
export const FAILURES_BEFORE_DELOAD = 3;
export const DELOAD_FRACTION = 0.9;

/** How much a completed session adds, by how heavy the lift's leverage is. */
export function stepFor(loadType: LoadType, increment: number): number {
  switch (loadType) {
    case 'lower':
      return Math.max(increment, 5);
    case 'upper':
      return Math.max(increment, 2.5);
    case 'accessory':
      return increment;
    case 'bodyweight':
      return 0;
  }
}

export function isSetSuccessful(set: LoggedSet): boolean {
  return set.reps >= set.targetReps;
}

/**
 * Whether the lifter actually did the work the program asked for. Only sets they logged
 * reach here, so a session cut short arrives as a short list — and a short list of good
 * sets is not a completed session, however good those sets were.
 */
export function isSessionComplete(sets: LoggedSet[], scheme: SetScheme): boolean {
  return sets.length >= scheme.sets;
}

/** A lift only progresses when every prescribed set hit every prescribed rep. */
export function isSessionSuccessful(sets: LoggedSet[], scheme: SetScheme): boolean {
  return isSessionComplete(sets, scheme) && sets.length > 0 && sets.every(isSetSuccessful);
}

/** Epley, capped at the rep range where the formula still means anything. */
export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + Math.min(reps, 12) / 30);
}

export interface ProgressionResult {
  next: LiftState;
  outcome: 'progressed' | 'held' | 'deloaded';
  nextWeight: number;
  /** Rep target for the next session — differs from the last one on a rep-range lift. */
  nextReps: number;
  message: string;
}

/** The rep target this lift is currently working at. */
export function currentTarget(state: LiftState, scheme: SetScheme): number {
  return state.workingReps ?? scheme.reps;
}

/** Whether this lift advances by reps before it advances by weight. */
export function usesRepRange(scheme: SetScheme): boolean {
  return scheme.maxReps !== undefined && scheme.maxReps > scheme.reps;
}

/**
 * Resolves one lift after one session. This is the whole promise of the app: the lifter
 * logs reps, and the next session is decided here.
 *
 * Two progression models, chosen by the program rather than by the lifter:
 *
 *  - Linear (a fixed rep target): all reps completed adds weight. Fast while it lasts,
 *    which for a beginner is months.
 *  - Double progression (a rep range): reps climb to the top of the range first, then the
 *    weight goes up and the reps reset to the bottom. Slower per session but it does not
 *    run out, which is why every program past the novice stage uses it.
 *
 * Either way, three missed sessions in a row pulls the weight back.
 */
export function applyProgression(
  state: LiftState,
  sets: LoggedSet[],
  scheme: SetScheme,
): ProgressionResult {
  const ex = getExercise(state.exerciseId);
  const weight = state.workingWeight;
  const target = currentTarget(state, scheme);

  // A session the lifter walked away from part-way through decides nothing. It is not a
  // success — they did not do the prescribed work — and it is not a miss either, because
  // they never failed a rep, so it must not count toward a deload or set a personal best.
  if (!isSessionComplete(sets, scheme)) {
    return {
      next: state,
      outcome: 'held',
      nextWeight: weight,
      nextReps: target,
      // `state` already carries any weight the lifter set in the gym, which stands as
      // their own decision. What is withheld is the verdict: no progression, no personal
      // best, and no strike toward a deload.
      message: `${sets.length} of ${scheme.sets} sets logged — too few to judge the lift, so nothing else changes. Same again next time.`,
    };
  }

  const success = isSessionSuccessful(sets, scheme);
  const totalReps = sets.reduce((n, s) => n + s.reps, 0);
  const bestSetReps = sets.reduce((n, s) => Math.max(n, s.reps), 0);

  const best1RM = Math.max(state.bestEstimated1RM, estimate1RM(weight, bestSetReps));
  const bestWeight = success ? Math.max(state.bestWeight, weight) : state.bestWeight;
  const bestReps = Math.max(state.bestReps ?? 0, bestSetReps);
  const base = { ...state, bestWeight, bestEstimated1RM: best1RM, bestReps };

  const step = stepFor(ex.loadType, ex.increment);
  const loadable = step > 0;
  const ranged = usesRepRange(scheme);
  const repStep = scheme.repStep ?? 1;

  if (success) {
    // Room left in the rep range: add reps at the same weight.
    if (ranged && target + repStep <= scheme.maxReps!) {
      const nextReps = target + repStep;
      return {
        next: { ...base, workingReps: nextReps, consecutiveFailures: 0 },
        outcome: 'progressed',
        nextWeight: weight,
        nextReps,
        message: `All ${target}${unit(ex)} — next time go for ${nextReps}.`,
      };
    }

    // Top of the range reached. Add weight and reset the reps, if there is weight to add.
    if (ranged && loadable) {
      const nextWeight = roundToIncrement(weight + step, ex.increment);
      return {
        next: {
          ...base,
          workingWeight: nextWeight,
          workingReps: scheme.reps,
          consecutiveFailures: 0,
        },
        outcome: 'progressed',
        nextWeight,
        nextReps: scheme.reps,
        message: `Top of the range at ${fmt(weight)}kg. Up to ${fmt(nextWeight)}kg, back to ${scheme.reps} reps.`,
      };
    }

    // A bodyweight movement at the top of its range has nowhere left to go by reps, and
    // no load to add. Hold and tell the lifter to make the movement harder instead.
    if (ranged) {
      return {
        next: { ...base, workingReps: scheme.maxReps, consecutiveFailures: 0 },
        outcome: 'progressed',
        nextWeight: weight,
        nextReps: scheme.maxReps!,
        message: `${scheme.maxReps}${unit(ex)} — you have outgrown this one. Slow the reps down or move to a harder variation.`,
      };
    }

    // Plain linear progression.
    if (loadable) {
      const nextWeight = roundToIncrement(weight + step, ex.increment);
      return {
        next: { ...base, workingWeight: nextWeight, consecutiveFailures: 0 },
        outcome: 'progressed',
        nextWeight,
        nextReps: target,
        message: `All reps — next time ${fmt(nextWeight)}kg (+${fmt(step)}).`,
      };
    }

    return {
      next: { ...base, consecutiveFailures: 0 },
      outcome: 'progressed',
      nextWeight: weight,
      nextReps: target,
      message: `${totalReps} total — nice.`,
    };
  }

  // --- Missed the target ---
  const failures = state.consecutiveFailures + 1;

  if (failures >= FAILURES_BEFORE_DELOAD) {
    // On a rep-range lift, back off the reps rather than the weight where there is room:
    // it is the gentler correction and keeps the load moving.
    if (ranged && target > scheme.reps) {
      return {
        next: { ...base, workingReps: scheme.reps, consecutiveFailures: 0 },
        outcome: 'deloaded',
        nextWeight: weight,
        nextReps: scheme.reps,
        message: `Stuck at ${target}${unit(ex)}. Back to ${scheme.reps} at ${fmt(weight)}kg and build up again.`,
      };
    }

    if (loadable) {
      const deloaded = Math.max(ex.minLoad, roundToIncrement(weight * DELOAD_FRACTION, ex.increment));
      // A deload that cannot actually reduce the weight (already at the bar) is pointless.
      if (deloaded < weight) {
        return {
          next: {
            ...base,
            workingWeight: deloaded,
            workingReps: ranged ? scheme.reps : undefined,
            consecutiveFailures: 0,
            deloads: state.deloads + 1,
            lastStallWeight: weight,
          },
          outcome: 'deloaded',
          nextWeight: deloaded,
          nextReps: ranged ? scheme.reps : target,
          message: `Third miss at ${fmt(weight)}kg. Dropping to ${fmt(deloaded)}kg to build back up with clean reps.`,
        };
      }
      return {
        next: { ...base, consecutiveFailures: 0 },
        outcome: 'held',
        nextWeight: weight,
        nextReps: target,
        message: `Already at the lightest this lift goes. Staying at ${fmt(weight)}kg — work on the movement.`,
      };
    }

    return {
      next: { ...base, consecutiveFailures: 0 },
      outcome: 'held',
      nextWeight: weight,
      nextReps: target,
      message: 'Logged. Same again next time.',
    };
  }

  const remaining = FAILURES_BEFORE_DELOAD - failures;
  return {
    next: { ...base, consecutiveFailures: failures },
    outcome: 'held',
    nextWeight: weight,
    nextReps: target,
    message: `Missed it — repeating ${loadable ? `${fmt(weight)}kg` : `${target}${unit(ex)}`}. ${remaining} more miss${
      remaining === 1 ? '' : 'es'
    } before it backs off.`,
  };
}

/** Planks are logged in seconds; everything else in reps. */
function unit(ex: { loadType: LoadType }): string {
  return ex.loadType === 'bodyweight' ? 's' : ' reps';
}

/** Blank set list for a lift about to be performed. */
export function buildSets(scheme: SetScheme, weight: number, targetReps?: number): LoggedSet[] {
  const reps = targetReps ?? scheme.reps;
  return Array.from({ length: scheme.sets }, () => ({
    targetReps: reps,
    reps,
    weight: roundToIncrement(weight * (scheme.loadFactor ?? 1), 0.5),
    completed: false,
  }));
}

export function fmt(n: number): string {
  // Two decimals is enough for every plate we support, and 1.25 must not become 1.3.
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * How a scheme's rep target reads on screen: the live target for a lift already working
 * inside its range, or the range itself for one that has not started yet.
 */
export function describeReps(scheme: SetScheme, workingReps?: number): string {
  if (!usesRepRange(scheme)) return String(scheme.reps);
  if (workingReps !== undefined) return `${workingReps}`;
  return `${scheme.reps}–${scheme.maxReps}`;
}
