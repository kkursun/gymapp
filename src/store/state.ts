import { getProgram } from '../data/programs';
import { getExercise } from '../data/exercises';
import { applyProgression, buildSets } from '../engine/progression';
import { buildLiftStates, seedNewLift, startingWeight } from '../engine/starting';
import { carryOverWeights } from '../engine/graduation';
import { snoozeUntil } from '../engine/checkin';
import { makeSnapper } from '../engine/plates';
import type { LoadSnapper } from '../engine/plates';
import { buildWarmupSets } from '../engine/warmup';
import { resolveSlots, withSubstitution } from '../engine/substitution';
import type { AppState, LoggedExercise, Profile, ProgramSlot, Session } from '../types';

export const STORAGE_KEY = 'ironpath.v1';
/**
 * Bumped to 2 when permanent exercise substitutions and the warm-up setting were added.
 * See `migrate` — a version the app does not recognise is never silently discarded.
 */
export const STATE_VERSION = 2;
/** Where a state we cannot migrate is parked, so the lifter can still export it. */
export const RESCUE_KEY = `${STORAGE_KEY}.unreadable`;

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
  substitutions: {},
  settings: {
    barKg: 20,
    plates: [25, 20, 15, 10, 5, 2.5, 1.25],
    restSecMain: 180,
    restSecAccessory: 90,
    sound: true,
    warmups: true,
  },
};

export type Action =
  | { type: 'onboard'; profile: Profile; programId: string }
  | { type: 'startSession' }
  | { type: 'setReps'; exerciseIndex: number; setIndex: number; reps: number }
  | { type: 'toggleSet'; exerciseIndex: number; setIndex: number }
  | { type: 'toggleWarmup'; exerciseIndex: number; setIndex: number }
  | { type: 'adjustWeight'; exerciseIndex: number; delta: number }
  | { type: 'skipExercise'; exerciseIndex: number }
  | { type: 'unskipExercise'; exerciseIndex: number }
  | { type: 'substituteExercise'; exerciseIndex: number; exerciseId: string; permanent: boolean }
  | { type: 'setSubstitution'; from: string; to: string }
  | { type: 'restoreExercise'; exerciseId: string }
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

/** The snapper for this lifter's bar and plates, so nothing unloadable is prescribed. */
export function snapperFor(state: AppState): LoadSnapper {
  return makeSnapper(state.settings);
}

export function currentDay(state: AppState) {
  if (!state.programId) return null;
  const program = getProgram(state.programId);
  return program.days[state.dayCursor % program.days.length];
}

/** The lifts of the current day, with any permanent substitutions applied. */
export function currentSlots(state: AppState): ProgramSlot[] {
  const day = currentDay(state);
  return day ? resolveSlots(day, state.substitutions) : [];
}

function warmupsFor(state: AppState, exerciseId: string, weight: number) {
  if (!state.settings.warmups) return undefined;
  const sets = buildWarmupSets(exerciseId, weight, {
    barKg: state.settings.barKg,
    snap: snapperFor(state),
  });
  return sets.length > 0 ? sets : undefined;
}

function makeActive(state: AppState): AppState['active'] {
  const day = currentDay(state);
  if (!day || !state.programId) return null;
  return {
    programId: state.programId,
    dayId: day.id,
    startedAt: new Date().toISOString(),
    exercises: resolveSlots(day, state.substitutions).map((resolved, i) => {
      // The slot names what the program prescribes; a permanent swap decides what is
      // actually trained. Both are kept so the scheme can still be looked up later.
      const slot = day.slots[i];
      const exerciseId = resolved.exerciseId;
      const lift = state.lifts[exerciseId];
      // A lift can be missing if an imported backup predates the current program, in
      // which case fall back to the body-based estimate rather than prescribing 0kg.
      const weight =
        lift?.workingWeight ??
        (state.profile ? startingWeight(state.profile, exerciseId, snapperFor(state)) : 0);
      return {
        exerciseId,
        ...(exerciseId !== slot.exerciseId ? { sourceExerciseId: slot.exerciseId } : {}),
        weight,
        warmups: warmupsFor(state, exerciseId, weight),
        sets: buildSets(slot.scheme, weight, lift?.workingReps),
        outcome: 'held' as const,
        nextWeight: weight,
      };
    }),
  };
}

/** Ensures a lift the lifter has just swapped in has somewhere to record its progress. */
function ensureLift(state: AppState, exerciseId: string): AppState['lifts'] {
  if (state.lifts[exerciseId] || !state.profile) return state.lifts;
  return {
    ...state.lifts,
    [exerciseId]: {
      exerciseId,
      workingWeight: seedNewLift(state.lifts, state.profile, exerciseId, snapperFor(state)),
      consecutiveFailures: 0,
      deloads: 0,
      bestWeight: 0,
      bestEstimated1RM: 0,
    },
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'onboard': {
      const profile = { ...action.profile, heightMeasuredAt: action.profile.createdAt };
      return {
        ...state,
        profile,
        programId: action.programId,
        dayCursor: 0,
        lifts: buildLiftStates(action.profile, action.programId, snapperFor(state), state.substitutions),
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
            j === action.setIndex
              ? { ...s, reps: Math.max(0, action.reps), completed: true, manual: true }
              : s,
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
          sets: ex.sets.map((s, j) => {
            if (j !== action.setIndex) return s;
            if (s.completed) return { ...s, completed: false };
            // Ticking a set off means "I hit the target". A set whose rep count was typed
            // in keeps that count, so un-ticking and re-ticking cannot silently turn a
            // missed set into a completed one and hand out weight nobody earned.
            return { ...s, completed: true, reps: s.manual ? s.reps : s.targetReps };
          }),
        };
      });
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'toggleWarmup': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) => {
        if (i !== action.exerciseIndex || !ex.warmups) return ex;
        return {
          ...ex,
          warmups: ex.warmups.map((s, j) =>
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
        // Step to a weight the plates can actually build, in the direction asked for.
        const snap = snapperFor(state);
        const weight = Math.max(
          meta.minLoad,
          snap(ex.weight + action.delta, meta, action.delta < 0 ? 'down' : 'up'),
        );
        return {
          ...ex,
          weight,
          // The ramp is a function of the working weight, so it moves with it.
          warmups: warmupsFor(state, ex.exerciseId, weight),
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

    case 'unskipExercise': {
      if (!state.active) return state;
      const exercises = state.active.exercises.map((ex, i) =>
        i === action.exerciseIndex && ex.outcome === 'skipped'
          ? { ...ex, outcome: 'held' as const }
          : ex,
      );
      return { ...state, active: { ...state.active, exercises } };
    }

    case 'substituteExercise': {
      if (!state.active) return state;
      const target = state.active.exercises[action.exerciseIndex];
      if (!target) return state;
      const day = getProgram(state.active.programId).days.find((d) => d.id === state.active!.dayId);
      const source = target.sourceExerciseId ?? target.exerciseId;
      const scheme = day?.slots.find((s) => s.exerciseId === source)?.scheme;
      if (!scheme) return state;

      const lifts = ensureLift(state, action.exerciseId);
      const weight = lifts[action.exerciseId]?.workingWeight ?? 0;
      const exercises = state.active.exercises.map((ex, i) =>
        i !== action.exerciseIndex
          ? ex
          : {
              exerciseId: action.exerciseId,
              // Remember which slot this filled: the scheme, and the progression, still
              // belong to the exercise the program prescribed.
              ...(action.exerciseId !== source ? { sourceExerciseId: source } : {}),
              weight,
              warmups: warmupsFor({ ...state, lifts }, action.exerciseId, weight),
              sets: buildSets(scheme, weight, lifts[action.exerciseId]?.workingReps),
              outcome: 'held' as const,
              nextWeight: weight,
            },
      );

      return {
        ...state,
        lifts,
        substitutions: action.permanent
          ? withSubstitution(state.substitutions, source, action.exerciseId)
          : state.substitutions,
        active: { ...state.active, exercises },
      };
    }

    case 'setSubstitution': {
      // The permanent-only path, used from Settings where there is no live session to
      // rewrite. Seeds the incoming lift so it arrives with a sensible working weight.
      const substitutions = withSubstitution(state.substitutions, action.from, action.to);
      return {
        ...state,
        substitutions,
        lifts: substitutions[action.from] ? ensureLift(state, action.to) : state.lifts,
      };
    }

    case 'restoreExercise': {
      const substitutions = { ...state.substitutions };
      delete substitutions[action.exerciseId];
      return { ...state, substitutions };
    }

    case 'finishSession': {
      if (!state.active || !state.profile) return state;
      const lifts = { ...state.lifts };
      const snap = snapperFor(state);
      const activeDay = getProgram(state.active.programId).days.find(
        (d) => d.id === state.active!.dayId,
      );
      const logged: LoggedExercise[] = state.active.exercises.map((ex) => {
        if (ex.outcome === 'skipped') return ex;
        const lift = lifts[ex.exerciseId];
        // A swapped-in lift fills the slot of the exercise the program prescribed, so the
        // scheme is looked up under that name rather than its own.
        const slotId = ex.sourceExerciseId ?? ex.exerciseId;
        const scheme = activeDay?.slots.find((s) => s.exerciseId === slotId)?.scheme;
        if (!lift || !scheme) return ex;
        // Only sets the lifter actually touched count toward the verdict. Warm-ups are
        // not among them — missing a ramp-up set is not a failed session.
        const performed = ex.sets.filter((s) => s.completed);
        if (performed.length === 0) return { ...ex, outcome: 'skipped' as const };
        // The lifter may have overridden the weight in the gym; judge what was lifted.
        const result = applyProgression(
          { ...lift, workingWeight: ex.weight },
          performed,
          scheme,
          snap,
        );
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
        notes: action.notes?.trim() || undefined,
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
      const snap = snapperFor(state);
      return {
        ...state,
        programId: action.programId,
        dayCursor: 0,
        active: null,
        lifts: carryOverWeights(
          state.lifts,
          action.programId,
          (id) => seedNewLift(state.lifts, profile, id, snap),
          state.substitutions,
        ),
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

    case 'deleteSession':
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id) };

    case 'reset':
      return { ...initialState };

    case 'import':
      return action.state;
  }
}

// --- Persistence -----------------------------------------------------------------------

/**
 * Upgrades an older stored state to the current shape. One entry per version, each
 * responsible only for the step from `n` to `n + 1`.
 *
 * This exists because the old loader returned `initialState` on any version mismatch,
 * which meant that shipping a new version silently erased every user's training history
 * on first launch. Data the app cannot read is now preserved rather than discarded.
 */
const MIGRATIONS: Record<number, (s: any) => any> = {
  1: (s) => ({
    ...s,
    version: 2,
    substitutions: {},
    settings: { ...s.settings, warmups: true },
  }),
};

/** Shape check for anything arriving from disk or from an imported backup file. */
export function looksLikeState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.version === 'number' &&
    typeof s.lifts === 'object' &&
    s.lifts !== null &&
    Array.isArray(s.sessions) &&
    Array.isArray(s.bodyweightLog) &&
    typeof s.settings === 'object' &&
    s.settings !== null &&
    (s.profile === null || typeof s.profile === 'object')
  );
}

/**
 * Brings a parsed state up to the current version, or returns null if it cannot be read —
 * a state from a newer build, or one whose shape does not match at all.
 */
export function migrate(value: unknown): AppState | null {
  if (!looksLikeState(value)) return null;
  let s: any = value;
  while (typeof s.version === 'number' && s.version < STATE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) return null;
    const next = step(s);
    // A migration that does not advance the version would spin forever.
    if (next.version <= s.version) return null;
    s = next;
  }
  if (s.version !== STATE_VERSION) return null;
  return {
    ...initialState,
    ...s,
    settings: { ...initialState.settings, ...s.settings },
    substitutions: { ...s.substitutions },
  };
}

export function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const migrated = migrate(JSON.parse(raw));
    if (migrated) return migrated;
    // Unreadable, but not worthless: keep it where an export can still reach it rather
    // than overwriting someone's training history with a blank slate.
    try {
      localStorage.setItem(RESCUE_KEY, raw);
    } catch {
      // Nothing more we can do; fall through to a clean start.
    }
    return initialState;
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
