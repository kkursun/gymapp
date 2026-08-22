import { getProgram, PROGRAM_MAP } from '../data/programs';
import { getExercise } from '../data/exercises';
import { applyProgression, buildSets } from '../engine/progression';
import { buildLiftStates, seedNewLift, startingWeight } from '../engine/starting';
import { carryOverWeights } from '../engine/graduation';
import { snoozeUntil } from '../engine/checkin';
import type { AppState, LoggedExercise, Profile, Session } from '../types';

export const STORAGE_KEY = 'ironpath.v1';
export const STATE_VERSION = 1;

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
          // Only the tick changes. buildSets already seeds `reps` with the target, so
          // re-ticking must never overwrite a rep count the lifter logged by hand — that
          // silently turned a missed set into a successful one.
          sets: ex.sets.map((s, j) =>
            j === action.setIndex ? { ...s, completed: !s.completed } : s,
          ),
        };
      });
      return { ...state, active: { ...state.active, exercises } };
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
      const logged: LoggedExercise[] = state.active.exercises.map((ex) => {
        if (ex.outcome === 'skipped') return ex;
        const lift = lifts[ex.exerciseId];
        const scheme = activeDay?.slots.find((s) => s.exerciseId === ex.exerciseId)?.scheme;
        if (!lift || !scheme) return ex;
        // Only sets the lifter actually touched count toward the verdict.
        const performed = ex.sets.filter((s) => s.completed);
        if (performed.length === 0) return { ...ex, outcome: 'skipped' as const };
        // The lifter may have overridden the weight in the gym; judge what was lifted.
        const result = applyProgression({ ...lift, workingWeight: ex.weight }, performed, scheme);
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

    case 'updateProfile': {
      if (!state.profile) return state;
      const { patch } = action;
      return {
        ...state,
        profile: {
          ...state.profile,
          ...patch,
          // Confirming a height is a fresh measurement, so the check-in clock restarts.
          // Without this the app keeps asking for a number the lifter just gave it.
          ...(patch.heightCm !== undefined
            ? { heightMeasuredAt: patch.heightMeasuredAt ?? new Date().toISOString() }
            : {}),
        },
      };
    }

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'skipDay':
      return { ...state, dayCursor: state.dayCursor + 1, active: null };

    case 'deleteSession':
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id) };

    case 'reset':
      return { ...initialState };

    case 'import':
      // Never trust a backup's shape. Anything missing falls back to the initial value,
      // so a hand-edited or truncated file cannot leave the app in a state that throws
      // on render — which, once persisted, would brick it on every subsequent launch.
      return normalizeState(action.state);
  }
}

/** A profile the app can actually compute with, rather than one that yields NaN targets. */
function isUsableProfile(profile: unknown): profile is Profile {
  const p = profile as Profile | null;
  return (
    !!p &&
    Number.isFinite(p.bodyweightKg) &&
    Number.isFinite(p.heightCm) &&
    Number.isFinite(p.age) &&
    p.bodyweightKg > 0 &&
    p.heightCm > 0
  );
}

/**
 * Coerces a loaded or imported blob into a state the app can render. Every field the UI
 * dereferences without checking gets a guaranteed value, and references to programs this
 * build does not have are dropped rather than left to throw inside `getProgram`.
 */
export function normalizeState(raw: Partial<AppState> | null | undefined): AppState {
  const parsed = raw ?? {};
  const profile = isUsableProfile(parsed.profile) ? parsed.profile : null;
  const programId = parsed.programId && PROGRAM_MAP[parsed.programId] ? parsed.programId : null;
  const active = parsed.active && PROGRAM_MAP[parsed.active.programId] ? parsed.active : null;

  return {
    ...initialState,
    ...parsed,
    version: STATE_VERSION,
    profile,
    // A program the lifter is not on cannot have a live session or a day cursor.
    programId,
    dayCursor: programId && Number.isFinite(parsed.dayCursor) ? Number(parsed.dayCursor) : 0,
    active: programId ? active : null,
    lifts: parsed.lifts && typeof parsed.lifts === 'object' ? parsed.lifts : {},
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    bodyweightLog: Array.isArray(parsed.bodyweightLog) ? parsed.bodyweightLog : [],
    handledPromotions: Array.isArray(parsed.handledPromotions) ? parsed.handledPromotions : [],
    settings: { ...initialState.settings, ...parsed.settings },
  };
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== STATE_VERSION) return initialState;
    return normalizeState(parsed);
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
