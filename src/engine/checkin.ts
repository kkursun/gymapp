import type { AppState } from '../types';

export const WEIGHT_INTERVAL_DAYS = 7;
/** Adults stop growing; teenagers do not, so they get asked far more often. */
export const HEIGHT_INTERVAL_DAYS = 182;
export const TEEN_HEIGHT_INTERVAL_DAYS = 60;
const SNOOZE_DAYS = 2;

export interface CheckIn {
  /** Whether height should be asked alongside bodyweight this time. */
  askHeight: boolean;
  daysSinceWeighIn: number;
  lastKg: number;
  /** Change since the previous weigh-in, once there is one to compare against. */
  deltaKg: number | null;
  message: string;
}

const DAY = 86400000;

function daysBetween(a: number, b: number): number {
  return Math.floor((a - b) / DAY);
}

/**
 * Decides whether to ask the lifter for fresh measurements. Their bodyweight drives the
 * lean-mass estimate, which drives every strength target in the app — so a figure from
 * three months ago quietly makes the whole thing wrong.
 */
export function dueCheckIn(state: AppState, now = Date.now()): CheckIn | null {
  const { profile } = state;
  if (!profile) return null;

  if (state.checkInSnoozedUntil && now < +new Date(state.checkInSnoozedUntil)) return null;

  const log = state.bodyweightLog;
  const last = log[log.length - 1];
  const lastAt = last ? +new Date(last.date) : +new Date(profile.createdAt);
  const daysSinceWeighIn = daysBetween(now, lastAt);
  if (daysSinceWeighIn < WEIGHT_INTERVAL_DAYS) return null;

  const heightInterval = profile.age < 20 ? TEEN_HEIGHT_INTERVAL_DAYS : HEIGHT_INTERVAL_DAYS;
  const heightAt = profile.heightMeasuredAt ? +new Date(profile.heightMeasuredAt) : +new Date(profile.createdAt);
  const askHeight = daysBetween(now, heightAt) >= heightInterval;

  const previous = log.length >= 2 ? log[log.length - 2] : null;
  const deltaKg = previous && last ? Math.round((last.kg - previous.kg) * 10) / 10 : null;

  const weeks = Math.round(daysSinceWeighIn / 7);
  const message =
    daysSinceWeighIn >= 28
      ? `It has been ${weeks} weeks since you last weighed in — your strength targets are drifting out of date.`
      : askHeight
        ? 'Time to re-check your measurements. Both numbers feed the targets the app sets for you.'
        : 'Time for your weekly weigh-in. It takes ten seconds and keeps your targets honest.';

  return {
    askHeight,
    daysSinceWeighIn,
    lastKg: last ? last.kg : profile.bodyweightKg,
    deltaKg,
    message,
  };
}

export function snoozeUntil(now = Date.now()): string {
  return new Date(now + SNOOZE_DAYS * DAY).toISOString();
}

/** Plain-language summary of what a new weigh-in did to the lifter's numbers. */
export function describeChange(previousKg: number, newKg: number): string {
  const delta = Math.round((newKg - previousKg) * 10) / 10;
  if (delta === 0) return 'Same as last time — steady.';
  if (delta > 0) return `Up ${delta}kg. Your strength targets went up with you.`;
  return `Down ${Math.abs(delta)}kg. Targets adjusted — hold your working weights and you are getting relatively stronger.`;
}
