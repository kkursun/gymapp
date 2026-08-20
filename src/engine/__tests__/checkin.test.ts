import { describe, expect, it } from 'vitest';
import { describeChange, dueCheckIn, HEIGHT_INTERVAL_DAYS, TEEN_HEIGHT_INTERVAL_DAYS } from '../checkin';
import { initialState, reducer } from '../../store/state';
import type { AppState, Profile } from '../../types';

const DAY = 86400000;
const NOW = Date.parse('2026-08-20T09:00:00.000Z');
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const profile: Profile = {
  name: 'Test',
  sex: 'male',
  age: 28,
  heightCm: 178,
  bodyweightKg: 78,
  experience: 'never',
  daysPerWeek: 3,
  hasRack: true,
  createdAt: ago(200),
  // Recently confirmed, so height is only asked for where a test says so.
  heightMeasuredAt: ago(10),
};

function state(over: Partial<AppState> = {}, p: Partial<Profile> = {}): AppState {
  return {
    ...initialState,
    profile: { ...profile, ...p },
    programId: 'strength-5x5',
    bodyweightLog: [{ date: ago(1), kg: 78 }],
    ...over,
  };
}

describe('check-in scheduling', () => {
  it('says nothing before there is anything to ask about', () => {
    expect(dueCheckIn(initialState, NOW)).toBeNull();
    expect(dueCheckIn(state(), NOW)).toBeNull();
  });

  it('asks for a weigh-in once a week has passed', () => {
    const c = dueCheckIn(state({ bodyweightLog: [{ date: ago(8), kg: 78 }] }), NOW);
    expect(c).not.toBeNull();
    expect(c!.daysSinceWeighIn).toBe(8);
    expect(c!.askHeight).toBe(false);
    expect(c!.message).toMatch(/weekly weigh-in/i);
  });

  it('gets more insistent when the numbers are badly out of date', () => {
    const c = dueCheckIn(state({ bodyweightLog: [{ date: ago(70), kg: 78 }] }), NOW);
    expect(c!.message).toMatch(/10 weeks/);
  });

  it('reports the change since the previous weigh-in', () => {
    const c = dueCheckIn(
      state({ bodyweightLog: [{ date: ago(40), kg: 78 }, { date: ago(9), kg: 80.4 }] }),
      NOW,
    );
    expect(c!.deltaKg).toBe(2.4);
    expect(c!.lastKg).toBe(80.4);
  });

  it('falls back to the profile date when nothing has ever been logged', () => {
    const c = dueCheckIn(state({ bodyweightLog: [] }), NOW);
    expect(c!.daysSinceWeighIn).toBe(200);
  });

  it('stays quiet while snoozed, and speaks up once the snooze expires', () => {
    const base = { bodyweightLog: [{ date: ago(20), kg: 78 }] };
    expect(dueCheckIn(state({ ...base, checkInSnoozedUntil: ago(-1) }), NOW)).toBeNull();
    expect(dueCheckIn(state({ ...base, checkInSnoozedUntil: ago(1) }), NOW)).not.toBeNull();
  });
});

describe('height re-measurement', () => {
  it('leaves an adults height alone for six months', () => {
    const stale = { bodyweightLog: [{ date: ago(8), kg: 78 }] };
    expect(dueCheckIn(state(stale, { heightMeasuredAt: ago(HEIGHT_INTERVAL_DAYS - 5) }), NOW)!.askHeight).toBe(false);
    expect(dueCheckIn(state(stale, { heightMeasuredAt: ago(HEIGHT_INTERVAL_DAYS + 1) }), NOW)!.askHeight).toBe(true);
  });

  it('asks a teenager far more often, because they are still growing', () => {
    const stale = { bodyweightLog: [{ date: ago(8), kg: 60 }] };
    const teen = { age: 16, heightMeasuredAt: ago(TEEN_HEIGHT_INTERVAL_DAYS + 1) };
    expect(dueCheckIn(state(stale, teen), NOW)!.askHeight).toBe(true);
    // An adult at the same interval is not asked yet.
    expect(dueCheckIn(state(stale, { heightMeasuredAt: ago(TEEN_HEIGHT_INTERVAL_DAYS + 1) }), NOW)!.askHeight).toBe(false);
  });
});

describe('recording a check-in', () => {
  it('updates weight, height and the measurement date, and clears the snooze', () => {
    const before = state({ checkInSnoozedUntil: ago(-1) });
    const after = reducer(before, { type: 'checkIn', kg: 80.2, heightCm: 179 });
    expect(after.profile!.bodyweightKg).toBe(80.2);
    expect(after.profile!.heightCm).toBe(179);
    expect(after.profile!.heightMeasuredAt).not.toBe(profile.heightMeasuredAt);
    expect(after.checkInSnoozedUntil).toBeUndefined();
    expect(after.bodyweightLog).toHaveLength(2);
  });

  it('leaves height untouched when only weight was asked for', () => {
    const after = reducer(state(), { type: 'checkIn', kg: 79 });
    expect(after.profile!.heightCm).toBe(178);
    expect(after.profile!.heightMeasuredAt).toBe(profile.heightMeasuredAt);
  });

  it('snoozing quiets the prompt for a couple of days', () => {
    const after = reducer(state({ bodyweightLog: [{ date: ago(30), kg: 78 }] }), { type: 'snoozeCheckIn' });
    expect(dueCheckIn(after)).toBeNull();
  });

  it('describes the change in plain language', () => {
    expect(describeChange(78, 80)).toMatch(/up 2kg/i);
    expect(describeChange(80, 78.5)).toMatch(/down 1.5kg/i);
    expect(describeChange(78, 78)).toMatch(/steady/i);
  });
});

describe('check-in copy', () => {
  it('mentions measurements rather than a weigh-in when height is also due', () => {
    const c = dueCheckIn(
      state({ bodyweightLog: [{ date: ago(8), kg: 78 }] }, { heightMeasuredAt: ago(HEIGHT_INTERVAL_DAYS + 1) }),
      NOW,
    );
    expect(c!.askHeight).toBe(true);
    expect(c!.message).toMatch(/measurements/i);
  });
});
