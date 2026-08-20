import { describe, expect, it } from 'vitest';
import { floorToIncrement, groupPlates, platesFor, roundToIncrement } from '../plates';

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
