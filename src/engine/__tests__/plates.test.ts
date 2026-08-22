import { describe, expect, it } from 'vitest';
import { floorToIncrement, groupPlates, makeSnapper, platesFor, roundToIncrement } from '../plates';
import { getExercise } from '../../data/exercises';

const STANDARD = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('plate maths', () => {
  it('loads the fewest plates that make the weight', () => {
    expect(platesFor(100, 20, STANDARD).perSide).toEqual([25, 15]);
    expect(platesFor(60, 20, STANDARD).perSide).toEqual([20]);
    expect(platesFor(62.5, 20, STANDARD).perSide).toEqual([20, 1.25]);
  });

  it('returns an empty bar when that is the whole weight', () => {
    const load = platesFor(20, 20, STANDARD);
    expect(load.perSide).toEqual([]);
    expect(load.achievable).toBe(20);
  });

  it('reports what it cannot make with the plates on hand', () => {
    // No 1.25s in the gym: 62.5kg is not loadable.
    const load = platesFor(62.5, 20, [25, 20, 10, 5, 2.5]);
    expect(load.remainder).toBe(2.5);
    expect(load.achievable).toBe(60);
  });

  it('does not fall foul of floating point on 2.5kg jumps', () => {
    for (let w = 20; w <= 200; w += 2.5) {
      const load = platesFor(w, 20, STANDARD);
      expect(load.remainder).toBe(0);
      expect(load.achievable).toBeCloseTo(w, 5);
    }
  });

  it('handles a 15kg womens bar', () => {
    expect(platesFor(35, 15, STANDARD).perSide).toEqual([10]);
  });

  it('groups repeated plates for display', () => {
    expect(groupPlates([25, 25, 10, 2.5])).toEqual([
      { plate: 25, count: 2 },
      { plate: 10, count: 1 },
      { plate: 2.5, count: 1 },
    ]);
  });

  it('rounds and floors to the gyms increment', () => {
    expect(roundToIncrement(61.2, 2.5)).toBe(60);
    expect(roundToIncrement(64, 2.5)).toBe(65);
    expect(floorToIncrement(64.9, 5)).toBe(60);
    expect(roundToIncrement(64.9, 0)).toBe(64.9);
  });
});

describe('makeSnapper', () => {
  const standard = { barKg: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };
  const coarse = { barKg: 20, plates: [25, 20, 15, 10, 5, 2.5] };
  const squat = getExercise('squat');
  const legPress = getExercise('leg-press');

  it('leaves an already-loadable weight alone', () => {
    const snap = makeSnapper(standard);
    expect(snap(62.5, squat, 'up')).toBe(62.5);
    expect(snap(62.5, squat, 'down')).toBe(62.5);
  });

  it('rounds up past a weight the plates cannot make', () => {
    // 22.5kg needs 1.25 a side. Without those plates the next real weight is 25kg, and
    // rounding down would leave the lift stuck at the bar forever.
    const snap = makeSnapper(coarse);
    expect(snap(22.5, squat, 'up')).toBe(25);
  });

  it('rounds a deload down to something loadable', () => {
    const snap = makeSnapper(coarse);
    expect(snap(22.5, squat, 'down')).toBe(20);
  });

  it('never goes below the bar', () => {
    const snap = makeSnapper(standard);
    expect(snap(10, squat, 'down')).toBe(20);
    expect(snap(0, squat, 'up')).toBe(20);
  });

  it('produces only weights the greedy loader can build exactly', () => {
    for (const bar of [standard, coarse, { barKg: 15, plates: [20, 10, 5, 2.5] }]) {
      const snap = makeSnapper(bar);
      for (let w = 20; w <= 200; w += 0.5) {
        for (const dir of ['up', 'down'] as const) {
          const snapped = snap(w, squat, dir);
          expect(platesFor(snapped, bar.barKg, bar.plates).remainder).toBe(0);
        }
      }
    }
  });

  it('uses the exercise increment for anything that is not a barbell', () => {
    const snap = makeSnapper(standard);
    // The leg press moves in 5kg pins off a 20kg minimum, whatever plates the gym owns.
    expect(snap(27, legPress, 'up')).toBe(30);
    expect(snap(27, legPress, 'down')).toBe(25);
  });

  it('falls back to the bar when the gym has no plates at all', () => {
    const snap = makeSnapper({ barKg: 20, plates: [] });
    expect(snap(60, squat, 'up')).toBe(20);
  });
});
