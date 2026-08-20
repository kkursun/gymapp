import { describe, expect, it } from 'vitest';
import { carryOverWeights, checkPromotion, describeStandardProgress } from '../graduation';
import { buildLiftStates, startingWeight } from '../starting';
import { initialState } from '../../store/state';
import type { AppState, Profile, Session } from '../../types';

const profile: Profile = {
  name: 'Test',
  sex: 'male',
  age: 28,
  heightCm: 178,
  bodyweightKg: 78,
  experience: 'never',
  daysPerWeek: 3,
  hasRack: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function stateOn(programId: string, sessionCount: number, over: Partial<AppState> = {}): AppState {
  const sessions: Session[] = Array.from({ length: sessionCount }, (_, i) => ({
    id: String(i),
    programId,
    dayId: 'A',
    // Spread backwards from today, three sessions a week.
    date: new Date(Date.now() - i * 2.33 * 86400000).toISOString(),
    exercises: [],
    durationSec: 2400,
    bodyweightKg: 78,
  }));
  return {
    ...initialState,
    profile,
    programId,
    lifts: buildLiftStates(profile, programId),
    sessions,
    ...over,
  };
}

describe('graduation from Foundation', () => {
  it('does not promote a lifter who just started', () => {
    expect(checkPromotion(stateOn('foundation', 4))).toBeNull();
  });

  it('promotes to the barbell after consistent work with real weight', () => {
    const s = stateOn('foundation', 20);
    s.lifts['goblet-squat'] = { ...s.lifts['goblet-squat'], bestWeight: 24 };
    const p = checkPromotion(s);
    expect(p?.to.id).toBe('strength-5x5');
    expect(p?.urgent).toBe(false);
  });

  it('holds back a lifter who has shown up but never added weight', () => {
    const s = stateOn('foundation', 20);
    s.lifts['goblet-squat'] = { ...s.lifts['goblet-squat'], bestWeight: 8 };
    expect(checkPromotion(s)).toBeNull();
  });

  it('never offers the barbell to someone with no rack', () => {
    const s = stateOn('foundation', 30, { profile: { ...profile, hasRack: false } });
    s.lifts['goblet-squat'] = { ...s.lifts['goblet-squat'], bestWeight: 30 };
    expect(checkPromotion(s)).toBeNull();
  });
});

describe('graduation from 5x5', () => {
  it('promotes urgently once linear progression is exhausted', () => {
    const s = stateOn('strength-5x5', 30);
    s.lifts['squat'] = { ...s.lifts['squat'], deloads: 2 };
    s.lifts['bench'] = { ...s.lifts['bench'], deloads: 1 };
    const p = checkPromotion(s);
    expect(p?.to.id).toBe('upper-lower');
    expect(p?.urgent).toBe(true);
    expect(p?.reasons.join(' ')).toMatch(/deloaded/);
  });

  it('does not treat a single deload as the end of the program', () => {
    const s = stateOn('strength-5x5', 30);
    s.lifts['squat'] = { ...s.lifts['squat'], deloads: 1 };
    expect(checkPromotion(s)).toBeNull();
  });

  it('promotes on time served even without stalls', () => {
    expect(checkPromotion(stateOn('strength-5x5', 62))?.to.id).toBe('upper-lower');
  });

  it('promotes when the main lifts clear the novice standard', () => {
    const s = stateOn('strength-5x5', 30);
    for (const id of ['squat', 'bench', 'deadlift']) {
      s.lifts[id] = { ...s.lifts[id], bestWeight: 500 };
    }
    expect(checkPromotion(s)?.to.id).toBe('upper-lower');
  });

  it('stops offering a promotion the lifter already dismissed', () => {
    const s = stateOn('strength-5x5', 30, { handledPromotions: ['strength-5x5->upper-lower'] });
    s.lifts['squat'] = { ...s.lifts['squat'], deloads: 3 };
    expect(checkPromotion(s)).toBeNull();
  });

  it('has nowhere to send a lifter already on the top program', () => {
    expect(checkPromotion(stateOn('upper-lower', 80))).toBeNull();
  });
});

describe('carrying weights across a program change', () => {
  it('keeps the weight on lifts that appear in both programs', () => {
    const from = buildLiftStates(profile, 'strength-5x5');
    from['squat'] = { ...from['squat'], workingWeight: 92.5, consecutiveFailures: 2, deloads: 1 };
    const to = carryOverWeights(from, 'upper-lower', (id) => startingWeight(profile, id));
    expect(to['squat'].workingWeight).toBe(92.5);
    expect(to['squat'].deloads).toBe(1);
    // The new rep scheme deserves a clean slate on the failure counter.
    expect(to['squat'].consecutiveFailures).toBe(0);
  });

  it('seeds brand-new lifts from the body estimate rather than zero', () => {
    const from = buildLiftStates(profile, 'strength-5x5');
    const to = carryOverWeights(from, 'upper-lower', (id) => startingWeight(profile, id));
    expect(to['romanian-deadlift'].workingWeight).toBeGreaterThan(0);
    expect(to['leg-press'].workingWeight).toBeGreaterThan(0);
  });

  it('drops lifts the new program does not use', () => {
    const from = buildLiftStates(profile, 'strength-5x5');
    const to = carryOverWeights(from, 'foundation', (id) => startingWeight(profile, id));
    expect(to['deadlift']).toBeUndefined();
    expect(Object.keys(to)).toContain('goblet-squat');
  });
});

describe('standard progress copy', () => {
  it('calls it cleared once it rounds to 100%', () => {
    expect(describeStandardProgress(1.4)).toBe('novice standard cleared');
    expect(describeStandardProgress(0.997)).toBe('novice standard cleared');
    expect(describeStandardProgress(0.62)).toBe('62% of novice standard');
  });
});
