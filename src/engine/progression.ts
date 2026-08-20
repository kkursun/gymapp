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

/** A lift only progresses when every prescribed rep was completed. */
export function isSessionSuccessful(sets: LoggedSet[]): boolean {
  return sets.length > 0 && sets.every(isSetSuccessful);
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
  message: string;
}

/**
 * Resolves one lift after one session. This is the whole promise of the app: the lifter
 * logs reps, and the next session's weight is decided here — including pulling the weight
 * back when the lift has stalled three sessions running.
 */
export function applyProgression(state: LiftState, sets: LoggedSet[]): ProgressionResult {
  const ex = getExercise(state.exerciseId);
  const weight = state.workingWeight;
  const success = isSessionSuccessful(sets);
  const totalReps = sets.reduce((n, s) => n + s.reps, 0);
  const bestSetReps = sets.reduce((n, s) => Math.max(n, s.reps), 0);

  const best1RM = Math.max(state.bestEstimated1RM, estimate1RM(weight, bestSetReps));
  const bestWeight = success ? Math.max(state.bestWeight, weight) : state.bestWeight;

  // Bodyweight movements have no load to add, so they progress by reps in the program
  // itself rather than here; record the effort and move on.
  if (ex.loadType === 'bodyweight' || stepFor(ex.loadType, ex.increment) === 0) {
    return {
      next: { ...state, consecutiveFailures: 0, bestEstimated1RM: best1RM, bestWeight },
      outcome: success ? 'progressed' : 'held',
      nextWeight: weight,
      message: success ? `${totalReps} total — nice.` : 'Logged. Same again next time.',
    };
  }

  if (success) {
    const step = stepFor(ex.loadType, ex.increment);
    const nextWeight = roundToIncrement(weight + step, ex.increment);
    return {
      next: {
        ...state,
        workingWeight: nextWeight,
        consecutiveFailures: 0,
        bestWeight,
        bestEstimated1RM: best1RM,
      },
      outcome: 'progressed',
      nextWeight,
      message: `All reps — next time ${fmt(nextWeight)}kg (+${fmt(step)}).`,
    };
  }

  const failures = state.consecutiveFailures + 1;

  if (failures >= FAILURES_BEFORE_DELOAD) {
    const deloaded = Math.max(
      ex.minLoad,
      roundToIncrement(weight * DELOAD_FRACTION, ex.increment),
    );
    // A deload that cannot actually reduce the weight (already at the bar) is pointless —
    // hold instead, so the lifter isn't told to deload the empty bar forever.
    if (deloaded >= weight) {
      return {
        next: { ...state, consecutiveFailures: 0, bestWeight, bestEstimated1RM: best1RM },
        outcome: 'held',
        nextWeight: weight,
        message: `Already at the lightest this lift goes. Staying at ${fmt(weight)}kg — work on the movement.`,
      };
    }
    return {
      next: {
        ...state,
        workingWeight: deloaded,
        consecutiveFailures: 0,
        deloads: state.deloads + 1,
        lastStallWeight: weight,
        bestWeight,
        bestEstimated1RM: best1RM,
      },
      outcome: 'deloaded',
      nextWeight: deloaded,
      message: `Third miss at ${fmt(weight)}kg. Dropping to ${fmt(deloaded)}kg to build back up with clean reps.`,
    };
  }

  return {
    next: { ...state, consecutiveFailures: failures, bestWeight, bestEstimated1RM: best1RM },
    outcome: 'held',
    nextWeight: weight,
    message: `Missed reps — repeating ${fmt(weight)}kg. ${FAILURES_BEFORE_DELOAD - failures} more miss${
      FAILURES_BEFORE_DELOAD - failures === 1 ? '' : 'es'
    } before a deload.`,
  };
}

/** Blank set list for a lift about to be performed. */
export function buildSets(scheme: SetScheme, weight: number): LoggedSet[] {
  return Array.from({ length: scheme.sets }, () => ({
    targetReps: scheme.reps,
    reps: scheme.reps,
    weight: roundToIncrement(weight * (scheme.loadFactor ?? 1), 0.5),
    completed: false,
  }));
}

export function fmt(n: number): string {
  // Two decimals is enough for every plate we support, and 1.25 must not become 1.3.
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
