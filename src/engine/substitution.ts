import { EXERCISES, getExercise } from '../data/exercises';
import type { Exercise, MovementPattern, Profile, Program, ProgramDay, ProgramSlot } from '../types';

/**
 * Swapping one lift for another.
 *
 * Two situations, one mechanism. The machine you need is occupied, so you want a
 * different lift for today only; or your gym simply does not own it, and you want it
 * gone for good. The first replaces the exercise inside the live session; the second
 * writes into `state.substitutions` and is resolved every time a program's slots are
 * read, so Home, Progress and the graduation engine all see the swap too.
 *
 * The program data is never rewritten. A substitution is a lens over it, which means it
 * survives program changes and can be lifted at any time.
 */
export type Substitutions = Record<string, string>;

/**
 * Patterns a lift may be swapped for. Mostly a pattern only substitutes for itself — a
 * bench press is not an overhead press. The exceptions are deliberate:
 *
 *  - The two pull patterns are interchangeable. Gyms routinely have a pulldown and no
 *    row station, or the reverse, and either trains the upper back.
 *  - A hinge and a hamstring curl swap both ways. The curl is the isolation version of
 *    the same job, and it is what is left when a gym has no space to deadlift.
 */
const COMPATIBLE: Record<MovementPattern, MovementPattern[]> = {
  squat: ['squat'],
  hinge: ['hinge', 'hamstring'],
  hamstring: ['hamstring', 'hinge'],
  'horizontal-push': ['horizontal-push'],
  'vertical-push': ['vertical-push'],
  'horizontal-pull': ['horizontal-pull', 'vertical-pull'],
  'vertical-pull': ['vertical-pull', 'horizontal-pull'],
  'shoulder-isolation': ['shoulder-isolation'],
  'elbow-flexion': ['elbow-flexion'],
  'elbow-extension': ['elbow-extension'],
  core: ['core'],
};

/** Whether a lift takes an external load the app can prescribe and progress. */
function loaded(ex: Exercise): boolean {
  return ex.standard.kind !== 'bodyweight';
}

export interface SubstituteOptions {
  /** Barbell lifts are only offered to a lifter who has somewhere to rack the bar. */
  hasRack: boolean;
  /**
   * Exercises already in the same session. Offering one of these would put the same lift
   * in a day twice, which the session log keys by exercise id and cannot represent.
   */
  exclude?: Iterable<string>;
}

/**
 * What may stand in for a given lift. Ordered so the closest match comes first: same
 * pattern before a compatible one, then same equipment, then nearest in leverage.
 */
export function substitutesFor(exerciseId: string, opts: SubstituteOptions): Exercise[] {
  const target = getExercise(exerciseId);
  const allowed = new Set(COMPATIBLE[target.pattern]);
  const excluded = new Set(opts.exclude ?? []);
  excluded.add(exerciseId);

  return Object.values(EXERCISES)
    .filter((ex) => {
      if (excluded.has(ex.id)) return false;
      if (!allowed.has(ex.pattern)) return false;
      // A bodyweight movement and a loaded one progress by different rules, and the
      // program's set scheme is written for one or the other. Never cross that line.
      if (loaded(ex) !== loaded(target)) return false;
      if (ex.equipment === 'barbell' && !opts.hasRack) return false;
      return true;
    })
    .sort((a, b) => {
      const pattern = Number(b.pattern === target.pattern) - Number(a.pattern === target.pattern);
      if (pattern !== 0) return pattern;
      const equipment = Number(b.equipment === target.equipment) - Number(a.equipment === target.equipment);
      if (equipment !== 0) return equipment;
      return Number(b.loadType === target.loadType) - Number(a.loadType === target.loadType);
    });
}

/** The lift actually trained in a slot, after any permanent swap. */
export function resolveId(exerciseId: string, subs: Substitutions = {}): string {
  const to = subs[exerciseId];
  // Guard against a self-map or a swap pointing at a lift that no longer exists.
  return to && to !== exerciseId && EXERCISES[to] ? to : exerciseId;
}

/** A program day's slots with permanent swaps applied. */
export function resolveSlots(day: ProgramDay, subs: Substitutions = {}): ProgramSlot[] {
  return day.slots.map((slot) => ({ ...slot, exerciseId: resolveId(slot.exerciseId, subs) }));
}

/** Every distinct lift a program trains, after swaps, in the order they are first met. */
export function programExerciseIds(program: Program, subs: Substitutions = {}): string[] {
  return [...new Set(program.days.flatMap((d) => resolveSlots(d, subs).map((s) => s.exerciseId)))];
}

/**
 * Adds a permanent swap, dropping it instead if it is a no-op. Storing an identity
 * mapping would leave the UI claiming a lift is substituted when nothing changed.
 */
export function withSubstitution(subs: Substitutions, from: string, to: string): Substitutions {
  const next = { ...subs };
  if (from === to || !EXERCISES[to]) delete next[from];
  else next[from] = to;
  return next;
}

/** How a swap reads on screen. */
export function describeSubstitution(from: string, to: string): string {
  return `${getExercise(to).name} instead of ${getExercise(from).name}`;
}

/** Substitutes for a lift, given the lifter and the day it sits in. */
export function substitutesForSlot(
  exerciseId: string,
  profile: Profile,
  sameDayIds: Iterable<string>,
): Exercise[] {
  return substitutesFor(exerciseId, { hasRack: profile.hasRack, exclude: sameDayIds });
}
