import { getProgram, PROGRAM_MAP } from '../data/programs';
import { getExercise } from '../data/exercises';
import type { AppState, Profile, Program } from '../types';
import { targetFiveRepMax } from './starting';
import { programExerciseIds } from './substitution';
import type { Substitutions } from './substitution';

export interface Promotion {
  /** Stable key so a dismissed offer is not shown again. */
  key: string;
  from: Program;
  to: Program;
  headline: string;
  reasons: string[];
  /** True when the lifter has run out of road on their current program, rather than
   *  simply becoming eligible for the next one. */
  urgent: boolean;
}

/**
 * The compound lifts of whichever program the lifter is on. Deriving this from the
 * program rather than hardcoding the barbell five matters: Foundation trains none of
 * them, so a fixed list left a Foundation lifter permanently unable to clear a standard.
 * Accessories and bodyweight holds are excluded — they are not what a program is judged on.
 */
export function mainLiftsOf(state: AppState): string[] {
  if (!state.programId) return [];
  const program = getProgram(state.programId);
  // Read through any permanent substitution: a lifter who swapped the leg press for a
  // goblet squat is judged on the lift they are actually doing.
  const ids = new Set(programExerciseIds(program, state.substitutions));
  return [...ids].filter((id) => {
    const loadType = getExercise(id).loadType;
    return loadType === 'lower' || loadType === 'upper';
  });
}

/** How many of a program's main lifts must clear the standard for it to be outgrown. */
export function clearedThreshold(mainCount: number): number {
  return Math.max(2, Math.ceil(mainCount * 0.6));
}

/**
 * Programs whose graduation can be triggered by clearing the novice standards.
 *
 * The later programs are not on this list, and that is the point: Upper/Lower graduates
 * on stalling rather than on standards, and Momentum has nowhere to graduate to at all.
 * The Progress screen reads this so it only promises a promotion the engine can deliver
 * — it used to tell every lifter on every program to "clear 3 more", which was wrong on
 * three programs out of four and unachievable on two of them.
 */
export const STANDARD_GATED_PROGRAMS = new Set(['foundation', 'strength-5x5']);

export interface PromotionOutlook {
  /** How many main lifts must clear their standard on this program. */
  threshold: number;
  cleared: number;
  /** Whether clearing standards actually promotes the lifter from here. */
  gatedOnStandards: boolean;
  /** Whether there is a further program at all. */
  hasNext: boolean;
}

/** What clearing the standards will and will not do for the lifter, on this program. */
export function promotionOutlook(state: AppState, profile: Profile): PromotionOutlook {
  const program = state.programId ? getProgram(state.programId) : null;
  return {
    threshold: clearedThreshold(mainLiftsOf(state).length),
    cleared: clearedStandards(state, profile).length,
    gatedOnStandards: !!program && STANDARD_GATED_PROGRAMS.has(program.id),
    hasNext: !!program && program.graduatesTo.length > 0,
  };
}

function sessionsOn(state: AppState, programId: string): number {
  return state.sessions.filter((s) => s.programId === programId).length;
}

function weeksOn(state: AppState, programId: string): number {
  const dates = state.sessions.filter((s) => s.programId === programId).map((s) => +new Date(s.date));
  if (dates.length < 2) return 0;
  return (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24 * 7);
}

/** Deloads across the program's main barbell lifts — the signal that linear gains are done. */
function mainLiftDeloads(state: AppState): number {
  return mainLiftsOf(state).reduce((n, id) => n + (state.lifts[id]?.deloads ?? 0), 0);
}

/** How far the lifter has come on their big lifts, as a share of their novice standard. */
export function standardProgress(
  state: AppState,
  profile: Profile,
): { id: string; ratio: number; demonstrated: number; target: number }[] {
  return mainLiftsOf(state)
    .filter((id) => state.lifts[id])
    .map((id) => {
      const target = targetFiveRepMax(profile, id);
      // bestWeight only. workingWeight is what the lifter is *about to* attempt, so
      // counting it would mark a standard cleared the moment someone taps the + button,
      // before they have lifted anything. A standard has to be demonstrated: all
      // prescribed reps completed at that weight.
      const demonstrated = state.lifts[id].bestWeight;
      return { id, ratio: target > 0 ? demonstrated / target : 0, demonstrated, target };
    });
}

/** Main lifts whose novice standard the lifter has actually demonstrated. */
export function clearedStandards(state: AppState, profile: Profile): string[] {
  return standardProgress(state, profile)
    .filter((p) => Math.round(p.ratio * 100) >= 100)
    .map((p) => p.id);
}

/**
 * Decides whether the lifter has outgrown their program. Two ways up: passing the
 * competence bar for the next program, or exhausting the current one by stalling
 * repeatedly on the main lifts.
 */
export function checkPromotion(state: AppState): Promotion | null {
  if (!state.profile || !state.programId) return null;
  const from = getProgram(state.programId);
  if (from.graduatesTo.length === 0) return null;

  const to = PROGRAM_MAP[from.graduatesTo[0]];
  if (!to) return null;

  const sessions = sessionsOn(state, from.id);
  const weeks = weeksOn(state, from.id);
  const deloads = mainLiftDeloads(state);
  const reasons: string[] = [];
  let urgent = false;
  let ready = false;

  if (from.id === 'foundation') {
    // Ready for the barbell once the movements are grooved and the weights are no longer
    // trivial. Needs a rack to be worth offering at all.
    if (!state.profile.hasRack) return null;
    const consistent = sessions >= 18 || weeks >= 6;
    const strongEnough = (state.lifts['goblet-squat']?.bestWeight ?? 0) >= 20;
    if (clearedStandards(state, state.profile).length >= clearedThreshold(mainLiftsOf(state).length)) {
      ready = true;
      reasons.push('You have cleared the novice standard on the lifts this program trains — machines have given you everything they can.');
      reasons.push('The barbell lifts add weight in smaller, more frequent steps, so progress gets smoother from here.');
    } else if (consistent && strongEnough) {
      ready = true;
      reasons.push(`${sessions} sessions logged — the movement patterns are yours now.`);
      reasons.push('The barbell lifts add weight in smaller, more frequent steps than dumbbells can, so progress gets smoother, not harder.');
    }
  }

  if (from.id === 'strength-5x5') {
    // Linear progression is over when the main lifts have been pulled back twice.
    if (deloads >= 3 && sessions >= 24) {
      ready = true;
      urgent = true;
      reasons.push(`Your main lifts have been deloaded ${deloads} times — adding weight every session has stopped working, which is exactly what is supposed to happen eventually.`);
      reasons.push('Upper/Lower gives each lift more volume and a full extra day of recovery, which is what turns a stall back into progress.');
    } else if (sessions >= 60 || weeks >= 20) {
      ready = true;
      reasons.push(`${sessions} sessions on 5×5 — you are past the point where a beginner program is the fastest route.`);
      reasons.push('Four days a week lets you train each lift harder without wrecking the next session.');
    } else {
      // Or the lifts themselves have cleared the novice standard. No session gate here:
      // the standard is defined by weight actually lifted, so clearing it already proves
      // the work was done, and the app promises on the Progress screen that clearing
      // these means the program has done its job. Making the lifter also serve a session
      // count would quietly break that promise.
      const cleared = clearedStandards(state, state.profile);
      if (cleared.length >= clearedThreshold(mainLiftsOf(state).length)) {
        const names = cleared.map((id) => getExercise(id).name).join(', ');
        ready = true;
        reasons.push(`${names} have all passed the novice standard for your size — that is the ceiling this program was built for.`);
        reasons.push('Upper/Lower gives each lift more volume and an extra day of recovery, which is what keeps a post-novice lifter progressing.');
      }
    }
  }

  if (from.id === 'upper-lower') {
    // Linear progression on the main lifts is finished when even the extra recovery of a
    // 4-day split has stopped rescuing it. Rep ranges are the answer, not more weight.
    if (deloads >= 4 && sessions >= 40) {
      ready = true;
      urgent = true;
      reasons.push(`Your main lifts have now been deloaded ${deloads} times across two programs — adding weight session to session has genuinely run out, which happens to everyone eventually.`);
      reasons.push('Momentum runs every lift on a rep range instead: you add reps first and weight only once you reach the top. It is slower per session and it does not stop working.');
    } else if (sessions >= 100) {
      ready = true;
      reasons.push(`${sessions} sessions on Upper/Lower — you are well past what a linear program was built to deliver.`);
      reasons.push('Moving to rep ranges gives you a progression that keeps going for years rather than months.');
    }
  }

  if (!ready) return null;

  const key = `${from.id}->${to.id}`;
  if (state.handledPromotions.includes(key)) return null;

  return {
    key,
    from,
    to,
    headline: urgent ? `Time to move on from ${from.name}` : `You're ready for ${to.name}`,
    reasons,
    urgent,
  };
}

/**
 * Carries working weights across a program change. Lifts that exist in both keep their
 * weight; new lifts are seeded from a related lift the lifter has already been training
 * so nobody restarts a squat at the empty bar.
 */
export function carryOverWeights(
  lifts: AppState['lifts'],
  toProgramId: string,
  seed: (exerciseId: string) => number,
  substitutions: Substitutions = {},
): AppState['lifts'] {
  const to = getProgram(toProgramId);
  const ids = new Set(programExerciseIds(to, substitutions));
  const next: AppState['lifts'] = {};

  for (const id of ids) {
    const existing = lifts[id];
    if (existing) {
      next[id] = {
        ...existing,
        // The weight carries over untouched. Only the failure counter is cleared, so the
        // new program's rep scheme is not judged against the one before it.
        consecutiveFailures: 0,
      };
      continue;
    }
    next[id] = {
      exerciseId: id,
      workingWeight: seed(id),
      consecutiveFailures: 0,
      deloads: 0,
      bestWeight: 0,
      bestEstimated1RM: 0,
    };
  }
  return next;
}

export function promotionSummary(p: Promotion): string {
  return `${p.from.name} → ${p.to.name}: ${p.reasons[0] ?? ''}`;
}

export function describeStandardProgress(ratio: number): string {
  const pct = Math.round(ratio * 100);
  // Round first, so a lift at 99.7% never reads "100% of novice standard".
  if (pct >= 100) return 'novice standard cleared';
  return `${pct}% of novice standard`;
}
