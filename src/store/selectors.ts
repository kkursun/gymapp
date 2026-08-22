import { getProgram } from '../data/programs';
import { resolveSlots } from '../engine/substitution';
import type { AppState, LoggedExercise, ProgramDay, ProgramSlot, SetScheme } from '../types';

export { snapperFor, currentSlots } from './state';

/**
 * The set scheme a logged exercise is working to.
 *
 * A swapped-in lift fills the slot of the exercise the program prescribed, so its scheme
 * has to be looked up under the original name. Getting this wrong is silent: the lookup
 * simply misses, the session records no progression, and the lifter's weight never moves.
 */
export function slotSchemeFor(day: ProgramDay, ex: Pick<LoggedExercise, 'exerciseId' | 'sourceExerciseId'>): SetScheme {
  const slotId = ex.sourceExerciseId ?? ex.exerciseId;
  const slot = day.slots.find((s) => s.exerciseId === slotId) ?? day.slots.find((s) => s.exerciseId === ex.exerciseId);
  // Every logged exercise came from a slot on this day; the fallback only matters for a
  // session imported from a build whose program data has since changed.
  return slot?.scheme ?? { sets: 3, reps: 5 };
}

/** Hook-shaped wrapper so screens can read a scheme without repeating the lookup. */
export function useSlotScheme(day: ProgramDay) {
  return (ex: Pick<LoggedExercise, 'exerciseId' | 'sourceExerciseId'>) => slotSchemeFor(day, ex);
}

/** The upcoming session's slots, with permanent substitutions applied. */
export function slotsForDay(state: AppState, day: ProgramDay): ProgramSlot[] {
  return resolveSlots(day, state.substitutions);
}

/** Every lift the current program trains, in program order, after substitutions. */
export function programSlots(state: AppState): ProgramSlot[] {
  if (!state.programId) return [];
  return getProgram(state.programId).days.flatMap((d) => resolveSlots(d, state.substitutions));
}
