import { getProgram, PROGRAM_MAP } from '../data/programs';
import type { AppState, Profile, Program } from '../types';
import { targetFiveRepMax } from './starting';

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

const MAIN_LIFTS = ['squat', 'bench', 'deadlift', 'ohp', 'row'];

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
  return MAIN_LIFTS.reduce((n, id) => n + (state.lifts[id]?.deloads ?? 0), 0);
}

/** How far the lifter has come on their big lifts, as a share of their novice standard. */
export function standardProgress(state: AppState, profile: Profile): { id: string; ratio: number }[] {
  return MAIN_LIFTS.filter((id) => state.lifts[id]).map((id) => {
    const target = targetFiveRepMax(profile, id);
    const best = Math.max(state.lifts[id].bestWeight, state.lifts[id].workingWeight);
    return { id, ratio: target > 0 ? best / target : 0 };
  });
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
    if (consistent && strongEnough) {
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
    } else if (state.profile) {
      // Or when the lifts themselves have cleared the novice standard.
      const progress = standardProgress(state, state.profile);
      const cleared = progress.filter((p) => p.ratio >= 1);
      if (cleared.length >= 3 && sessions >= 24) {
        ready = true;
        reasons.push(`Squat, bench and deadlift have all passed the novice standard for your size — ${cleared.map((c) => c.id).join(', ')}.`);
        reasons.push('That is the ceiling this program was built for.');
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
): AppState['lifts'] {
  const to = getProgram(toProgramId);
  const ids = new Set(to.days.flatMap((d) => d.slots.map((s) => s.exerciseId)));
  const next: AppState['lifts'] = {};

  for (const id of ids) {
    const existing = lifts[id];
    if (existing) {
      next[id] = {
        ...existing,
        // A fresh program deserves a fresh run-up: back off slightly and reset the
        // failure counters so the new rep scheme is not judged against the old one.
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
