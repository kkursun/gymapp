import type { StandardSource } from './engine/standards';

export type Sex = 'male' | 'female';
export type Experience = 'never' | 'some' | 'returning';
export type MuscleGroup = 'legs' | 'chest' | 'back' | 'shoulders' | 'arms' | 'core';
/** Which lever the load sits on — decides the size of a progression step. */
export type LoadType = 'lower' | 'upper' | 'accessory' | 'bodyweight';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
/**
 * What the movement actually does, which is what makes two lifts interchangeable. Two
 * exercises sharing a pattern (or a compatible one — see engine/substitution.ts) train
 * the same thing, so one can stand in for the other when a machine is occupied or a gym
 * simply does not have it.
 */
export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'hamstring'
  | 'horizontal-push'
  | 'vertical-push'
  | 'horizontal-pull'
  | 'vertical-pull'
  | 'shoulder-isolation'
  | 'elbow-flexion'
  | 'elbow-extension'
  | 'core';
/** Reps for almost everything; seconds for holds like the plank. */
export type RepUnit = 'reps' | 'seconds';

export interface Exercise {
  id: string;
  name: string;
  loadType: LoadType;
  equipment: Equipment;
  primary: MuscleGroup;
  /** What the movement trains, which decides what may be swapped in for it. */
  pattern: MovementPattern;
  /** Holds are logged in seconds. Absent means reps. */
  unit?: RepUnit;
  /** How this lift's novice standard is derived — see engine/standards.ts. */
  standard: StandardSource;
  /** Smallest weight change the gym's hardware allows, in kg. */
  increment: number;
  /** Lightest usable load in kg (empty bar, lightest dumbbell pair, machine stack start). */
  minLoad: number;
  cues: string[];
  /** Shown when the lifter's build makes the standard setup awkward. */
  heightNote?: { tallerThanCm?: number; shorterThanCm?: number; text: string };
}

export interface SetScheme {
  sets: number;
  /** Reps to start at. With `maxReps` set, this is the bottom of the range. */
  reps: number;
  /**
   * Top of the rep range. Its presence switches the lift to double progression: reps
   * climb from `reps` to `maxReps` at a fixed weight, then the weight goes up and the
   * reps drop back to the bottom. This is what keeps a lift progressing once adding
   * weight every session has stopped working.
   */
  maxReps?: number;
  /** Reps added per successful session. Planks count seconds, so they move in fives. */
  repStep?: number;
}

export interface ProgramSlot {
  exerciseId: string;
  scheme: SetScheme;
}

export interface ProgramDay {
  id: string;
  name: string;
  slots: ProgramSlot[];
}

export interface Program {
  id: string;
  name: string;
  tagline: string;
  description: string;
  daysPerWeek: number;
  /** Days are run in this order, cycling. */
  days: ProgramDay[];
  level: 1 | 2 | 3;
  requires: Equipment[];
  /** Programs this one can promote the lifter into. */
  graduatesTo: string[];
}

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  bodyweightKg: number;
  experience: Experience;
  daysPerWeek: number;
  hasRack: boolean;
  createdAt: string;
  /** When height was last confirmed, so the app knows when to ask again. */
  heightMeasuredAt?: string;
}

/** Live state of one lift: what to load next, and how it has been going. */
export interface LiftState {
  exerciseId: string;
  workingWeight: number;
  /** Consecutive sessions where the lifter missed the prescribed reps. */
  consecutiveFailures: number;
  deloads: number;
  /** Heaviest fully-completed session weight. */
  bestWeight: number;
  bestEstimated1RM: number;
  /** Weight the lifter stalled out at before the most recent deload. */
  lastStallWeight?: number;
  /**
   * Current rep target for a double-progression lift. Absent means the lift has not
   * moved off the bottom of its range yet, or does not use rep ranges at all.
   */
  workingReps?: number;
  /** Best rep count reached at the top of the range, for bodyweight movements. */
  bestReps?: number;
}

export interface LoggedSet {
  targetReps: number;
  reps: number;
  weight: number;
  completed: boolean;
  /**
   * Set when the lifter typed the rep count in rather than tapping the set done. Ticking
   * a set off fills in the target reps; re-ticking one that was logged short must not
   * quietly overwrite what actually happened.
   */
  manual?: boolean;
}

export interface LoggedExercise {
  exerciseId: string;
  /**
   * The program slot this filled, when the lifter swapped the prescribed lift for
   * something else. The scheme still comes from the original slot.
   */
  sourceExerciseId?: string;
  weight: number;
  /** Ramp-up sets. Never judged for progression — they exist to warm the lift up. */
  warmups?: LoggedSet[];
  sets: LoggedSet[];
  /** Progression verdict, resolved when the session was finished. */
  outcome: 'progressed' | 'held' | 'deloaded' | 'skipped';
  nextWeight: number;
}

export interface Session {
  id: string;
  programId: string;
  dayId: string;
  date: string;
  exercises: LoggedExercise[];
  durationSec: number;
  bodyweightKg: number;
  notes?: string;
}

export interface BodyweightEntry {
  date: string;
  kg: number;
}

export interface ActiveSession {
  programId: string;
  dayId: string;
  startedAt: string;
  exercises: LoggedExercise[];
}

export interface AppState {
  version: number;
  profile: Profile | null;
  programId: string | null;
  /** Index into the program's day rotation. */
  dayCursor: number;
  lifts: Record<string, LiftState>;
  sessions: Session[];
  bodyweightLog: BodyweightEntry[];
  active: ActiveSession | null;
  /** Graduation offers already accepted or dismissed, so they aren't re-shown. */
  handledPromotions: string[];
  /** Set when the lifter defers a measurement check-in. */
  checkInSnoozedUntil?: string;
  /**
   * Permanent exercise swaps, keyed by the exercise the program prescribes. Applied
   * wherever the program's slots are read, so a gym without a leg press stays usable.
   */
  substitutions: Record<string, string>;
  settings: {
    barKg: number;
    plates: number[];
    restSecMain: number;
    restSecAccessory: number;
    sound: boolean;
    /** Ramp-up sets before the working sets on the big lifts. */
    warmups: boolean;
  };
}
