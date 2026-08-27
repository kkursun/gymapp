import { getProgram } from '../data/programs';
import { getExercise } from '../data/exercises';
import { applyProgression, bankRecords, buildSets, extraOnlyResult, manualSet } from '../engine/progression';
import { buildLiftStates, isLoaded, seedNewLift, startingWeight } from '../engine/starting';
import { carryOverWeights } from '../engine/graduation';
import { snoozeUntil } from '../engine/checkin';
import type { AppState, LiftState, LoggedExercise, LoggedSet, Profile, Session } from '../types';

export const STORAGE_KEY = 'ironpath.v1';
export const STATE_VERSION = 1;

/** Day id used by lifts logged outside the rotation, which belong to no program day. */
export const EXTRA_DAY_ID = 'extra';

export const initialState: AppState = {
  version: STATE_VERSION,
  profile: null,
  programId: null,
  dayCursor: 0,
  lifts: {},
  sessions: [],
  bodyweightLog: [],
  active: null,
  handledPromotions: [],
  settings: {
    barKg: 20,
    plates: [25, 20, 15, 10, 5, 2.5, 1.25],
    restSecMain: 180,
    restSecAccessory: 90,
    sound: true,
  },
};

export type Action =
  | { type: 'onboard'; profile: Profile; programId: string }
  | { type: 'startSession' }
  | { type: 'setReps'; exerciseIndex: number; setIndex: number; reps: number }
  | { type: 'toggleSet'; exerciseIndex: number; setIndex: number }
  | { type: 'addSet'; exerciseIndex: number }
  | { type: 'removeSet'; exerciseIndex: number; setIndex: number }
  | { type: 'addExercise'; exerciseId: string; weight: number; reps: number; sets: number }
  | { type: 'adjustWeight'; exerciseIndex: number; delta: number }
  | { type: 'skipExercise'; exerciseIndex: number }
  | { type: 'finishSession'; durationSec: number; notes?: string }
  | { type: 'cancelSession' }
  | { type: 'switchProgram'; programId: string; promotionKey?: string }
  | { type: 'dismissPromotion'; key: string }
  | { type: 'logBodyweight'; kg: number }
  | { type: 'checkIn'; kg: number; heightCm?: number }
  | { type: 'snoozeCheckIn' }
  | { type: 'updateProfile'; patch: Partial<Profile> }
  | { type: 'updateSettings'; patch: Partial<AppState['settings']> }
  | { type: 'skipDay' }
  | { type: 'logExtraLift'; exerciseId: string; weight: number; reps: number; sets: number }
  | { type: 'editLoggedSet'; sessionId: string; exerciseIndex: number; setIndex: number; reps: number }
  | { type: 'deleteSession'; id: string }
  | { type: 'reset' }
  | { type: 'import'; state: AppState };

export function currentDay(state: AppState) {
  if (!state.programId) return null;
  const program = getProgram(state.programId);
  return program.days[state.dayCursor % program.days.length];
}

function makeActive(state: AppState): AppState['active'] {
  const day = currentDay(state);
  if (!day || !state.programId) return null;
  return {
    programId: state.programId,
    dayId: day.id,
    startedAt: new Date().toISOString(),
    exercises: day.slots.map((slot) => {
      const lift = state.lifts[slot.exerciseId];
      // A lift can be missing if an imported backup predates the current program, in
      // which case fall back to the body-based estimate rather than prescribing 0kg.
      const weight =
        lift?.workingWeight ??
        (state.profile ? startingWeight(state.profile, slot.exerciseId) : 0);
      return {
        exerciseId: slot.exerciseId,
        weight,
        sets: buildSets(slot.scheme, weight, lift?.workingReps),
        outcome: 'held' as const,
        nextWeight: weight,
      };
    }),
  };
}

/** A lift the program never gave the lifter, so it has no saved state to bank into yet. */
function ensureLift(
  lifts: Record<string, LiftState>,
  profile: Profile,
  exerciseId: string,
): LiftState {
  const existing = lifts[exerciseId];
  if (existing) return existing;
  return {
    exerciseId,
    workingWeight: seedNewLift(lifts, profile, exerciseId),
    consecutiveFailures: 0,
    deloads: 0,
    bestWeight: 0,
    bestEstimated1RM: 0,
  };
}

/** Sets for a lift the lifter is entering by hand, all marked as their own work. */
function handLoggedSets(
  exerciseId: string,
  weight: number,
  reps: number,
  count: number,
  completed: boolean,
): LoggedSet[] {
  const load = isLoaded(exerciseId) ? Math.max(0, weight) : 0;
  return Array.from({ length: Math.max(1, count) }, () =>
    manualSet(Math.max(0, reps), load, completed),
  );
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'onboard': {
      return {
        ...state,
        profile: { ...action.profile, heightMeasuredAt: action.profile.createdAt },
        programId: action.programId,
        dayCursor: 0,
        lifts: buildLiftStates(action.profile, action.programId),
        bodyweightLog: [{ date: new Date().toISOString(), kg: action.profile.bodyweightKg }],
      };
    }

    case 'startSession':
      return { ...state, active: makeActive(state) };

    case 'cancelSession':
      return { ...state, active: null };

    case 'setReps': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) => {
        if (i !== action.exerciseIndex) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) =>
            j === action.setIndex ? { ...s, reps: Math.max(0, action.reps), completed: true } : s,
          ),
        };
      });
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'toggleSet': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) => {
        if (i !== action.exerciseIndex) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) =>
            j === action.setIndex
              ? { ...s, completed: !s.completed, reps: s.completed ? s.reps : s.targetReps }
              : s,
          ),
        };
      });
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'addSet': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) => {
        if (i !== action.exerciseIndex) return ex;
        // A set added by hand inherits the last set's target so the button reads
        // sensibly, but it is marked manual and never counts against the lift.
        const last = ex.sets[ex.sets.length - 1];
        return { ...ex, sets: [...ex.sets, manualSet(last?.targetReps ?? 0, ex.weight)] };
      });
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'removeSet': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) => {
        if (i !== action.exerciseIndex) return ex;
        // The program's own sets are not the lifter's to delete — skip the lift instead.
        if (!ex.sets[action.setIndex]?.manual) return ex;
        return { ...ex, sets: ex.sets.filter((_, j) => j !== action.setIndex) };
      });
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'addExercise': {
      if (!state.active) return state;
      const existing = state.active.exercises.findIndex((e) => e.exerciseId === action.exerciseId);
      // Already on the card: give it the extra sets rather than listing it twice.
      if (existing !== -1) {
        const exercises = state.active.exercises.map((ex, i) =>
          i !== existing
            ? ex
            : {
                ...ex,
                outcome: ex.outcome === 'skipped' ? ('held' as const) : ex.outcome,
                sets: [
                  ...ex.sets,
                  ...handLoggedSets(action.exerciseId, ex.weight, action.reps, action.sets, false),
                ],
              },
        );
        return { ...state, active: { ...state.active, exercises } };
      }
      const weight = isLoaded(action.exerciseId) ? Math.max(0, action.weight) : 0;
      const added: LoggedExercise = {
        exerciseId: action.exerciseId,
        weight,
        sets: handLoggedSets(action.exerciseId, weight, action.reps, action.sets, false),
        outcome: 'held',
        nextWeight: weight,
        adhoc: true,
      };
      return {
        ...state,
        active: { ...state.active, exercises: [...state.active.exercises, added] },
      };
    }

    case 'adjustWeight': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) => {
        if (i !== action.exerciseIndex) return ex;
        const meta = getExercise(ex.exerciseId);
        const weight = Math.max(meta.minLoad, ex.weight + action.delta);
        return {
          ...ex,
          weight,
          sets: ex.sets.map((s) => ({ ...s, weight })),
        };
      });
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'skipExercise': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) =>
        i === action.exerciseIndex ? { ...ex, outcome: 'skipped' as const } : ex,
      );
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'finishSession': {
      if (!state.active || !state.profile) return state;
      const lifts = { ...state.lifts };
      const activeDay = getProgram(state.active.programId).days.find(
        (d) => d.id === state.active!.dayId,
      );
      const profile = state.profile;
      const logged: LoggedExercise[] = state.active.exercises.map((ex) => {
        if (ex.outcome === 'skipped') return ex;
        // Only sets the lifter actually touched count toward the verdict.
        const performed = ex.sets.filter((s) => s.completed);
        if (performed.length === 0) return { ...ex, outcome: 'skipped' as const };
        const scheme = activeDay?.slots.find((s) => s.exerciseId === ex.exerciseId)?.scheme;
        const lift = ensureLift(lifts, profile, ex.exerciseId);
        // A lift the lifter added has no prescription to hit, so it banks records and
        // leaves the working weight alone. Everything else is judged as normal, from the
        // weight actually lifted — they may have overridden it in the gym.
        const result = scheme
          ? applyProgression({ ...lift, workingWeight: ex.weight }, performed, scheme)
          : extraOnlyResult(lift, undefined, performed);
        lifts[ex.exerciseId] = result.next;
        return { ...ex, sets: performed, outcome: result.outcome, nextWeight: result.nextWeight };
      });

      const session: Session = {
        id: `${Date.now()}`,
        programId: state.active.programId,
        dayId: state.active.dayId,
        date: new Date().toISOString(),
        exercises: logged,
        durationSec: action.durationSec,
        bodyweightKg: state.profile.bodyweightKg,
        notes: action.notes,
      };

      return {
        ...state,
        lifts,
        sessions: [session, ...state.sessions],
        dayCursor: state.dayCursor + 1,
        active: null,
      };
    }

    case 'switchProgram': {
      if (!state.profile) return state;
      const profile = state.profile;
      return {
        ...state,
        programId: action.programId,
        dayCursor: 0,
        active: null,
        lifts: carryOverWeights(state.lifts, action.programId, (id) => seedNewLift(state.lifts, profile, id)),
        handledPromotions: action.promotionKey
          ? [...state.handledPromotions, action.promotionKey]
          : state.handledPromotions,
      };
    }

    case 'dismissPromotion':
      return { ...state, handledPromotions: [...state.handledPromotions, action.key] };

    case 'logBodyweight': {
      if (!state.profile) return state;
      return {
        ...state,
        profile: { ...state.profile, bodyweightKg: action.kg },
        bodyweightLog: [...state.bodyweightLog, { date: new Date().toISOString(), kg: action.kg }],
        checkInSnoozedUntil: undefined,
      };
    }

    case 'checkIn': {
      if (!state.profile) return state;
      const now = new Date().toISOString();
      return {
        ...state,
        profile: {
          ...state.profile,
          bodyweightKg: action.kg,
          ...(action.heightCm !== undefined
            ? { heightCm: action.heightCm, heightMeasuredAt: now }
            : {}),
        },
        bodyweightLog: [...state.bodyweightLog, { date: now, kg: action.kg }],
        checkInSnoozedUntil: undefined,
      };
    }

    case 'snoozeCheckIn':
      return { ...state, checkInSnoozedUntil: snoozeUntil() };

    case 'updateProfile':
      return state.profile ? { ...state, profile: { ...state.profile, ...action.patch } } : state;

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'skipDay':
      return { ...state, dayCursor: state.dayCursor + 1, active: null };

    case 'logExtraLift': {
      if (!state.profile || !state.programId) return state;
      const weight = isLoaded(action.exerciseId) ? Math.max(0, action.weight) : 0;
      const sets = handLoggedSets(action.exerciseId, weight, action.reps, action.sets, true);
      const lifts = { ...state.lifts };
      const banked = bankRecords(ensureLift(lifts, state.profile, action.exerciseId), sets);
      lifts[action.exerciseId] = banked;

      const entry: LoggedExercise = {
        exerciseId: action.exerciseId,
        weight,
        sets,
        outcome: 'held',
        nextWeight: banked.workingWeight,
        adhoc: true,
      };
      const now = new Date().toISOString();
      // Everything logged off-program on one day belongs to one card in history, rather
      // than burying the week's real sessions under a stack of one-lift entries.
      const todays = state.sessions.findIndex((s) => s.kind === 'extra' && isSameDay(s.date, now));
      const sessions =
        todays === -1
          ? [
              {
                id: `${Date.now()}`,
                programId: state.programId,
                dayId: EXTRA_DAY_ID,
                date: now,
                exercises: [entry],
                durationSec: 0,
                bodyweightKg: state.profile.bodyweightKg,
                kind: 'extra' as const,
              },
              ...state.sessions,
            ]
          : state.sessions.map((s, i) =>
              i === todays ? { ...s, exercises: [...s.exercises, entry] } : s,
            );

      return { ...state, lifts, sessions };
    }

    case 'editLoggedSet': {
      // A correction to the record only. Weights are not recomputed from history — the
      // same rule the delete button already states.
      const sessions = state.sessions.map((session) => {
        if (session.id !== action.sessionId) return session;
        return {
          ...session,
          exercises: session.exercises.map((ex, i) =>
            i !== action.exerciseIndex
              ? ex
              : {
                  ...ex,
                  sets: ex.sets.map((set, j) =>
                    j === action.setIndex ? { ...set, reps: Math.max(0, action.reps) } : set,
                  ),
                },
          ),
        };
      });
      return { ...state, sessions };
    }

    case 'deleteSession':
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id) };

    case 'reset':
      return { ...initialState };

    case 'import':
      return action.state;
  }
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== STATE_VERSION) return initialState;
    return { ...initialState, ...parsed, settings: { ...initialState.settings, ...parsed.settings } };
  } catch {
    return initialState;
  }
}

export function save(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private browsing) — the session still works in memory.
  }
}
