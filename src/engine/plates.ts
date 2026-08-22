/** Round to something the gym's hardware can actually make. */
export function roundToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return weight;
  return Math.round(weight / increment) * increment;
}

export function floorToIncrement(weight: number, increment: number): number {
  if (increment <= 0) return weight;
  return Math.floor(weight / increment) * increment;
}

export interface PlateLoad {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: number[];
  /** Weight that could not be made with the available plates. */
  remainder: number;
  achievable: number;
}

/** Greedy plate maths — what to actually hang on each end of the bar. */
export function platesFor(target: number, barKg: number, plates: number[]): PlateLoad {
  if (target <= barKg) return { perSide: [], remainder: 0, achievable: barKg };
  const available = [...plates].sort((a, b) => b - a);
  let perSideKg = (target - barKg) / 2;
  const perSide: number[] = [];
  for (const plate of available) {
    while (perSideKg >= plate - 1e-9) {
      perSide.push(plate);
      perSideKg -= plate;
    }
  }
  const remainder = Math.round(perSideKg * 2 * 100) / 100;
  return { perSide, remainder, achievable: Math.round((target - remainder) * 100) / 100 };
}

/** Group a plate list into "2×20kg, 1×5kg" style pairs for display. */
export function groupPlates(perSide: number[]): { plate: number; count: number }[] {
  const out: { plate: number; count: number }[] = [];
  for (const p of perSide) {
    const last = out[out.length - 1];
    if (last && last.plate === p) last.count++;
    else out.push({ plate: p, count: 1 });
  }
  return out;
}

/**
 * Rounds a weight to something this gym can actually load, in a given direction.
 *
 * The app used to prescribe any multiple of the exercise's nominal increment, which is
 * only loadable if the lifter owns the matching plates. Turn off the 1.25kg pair and a
 * 2.5kg jump on the bar becomes impossible — the old code would happily prescribe it,
 * show "+2.5kg short", and then log a weight nobody lifted into the history, the charts
 * and the demonstrated-standard calculation that gates promotion.
 */
export type LoadSnapper = (
  weight: number,
  ex: { equipment: string; increment: number; minLoad: number },
  dir: 'up' | 'down',
) => number;

export interface BarSettings {
  barKg: number;
  plates: number[];
}

/**
 * The smallest change a loaded barbell can make: a pair of the lightest plate. Real plate
 * sets are all multiples of their smallest member (1.25 divides 2.5, 5, 10, 15, 20, 25),
 * so every multiple of this step above the bar is reachable by the greedy loader.
 */
export function barbellStep(plates: number[]): number {
  const usable = plates.filter((p) => p > 0);
  return usable.length === 0 ? 0 : 2 * Math.min(...usable);
}

function snapBarbell(weight: number, bar: BarSettings, minLoad: number, dir: 'up' | 'down'): number {
  const step = barbellStep(bar.plates);
  const floor = Math.max(bar.barKg, minLoad);
  if (weight <= floor) return floor;
  if (step <= 0) return floor;
  const above = (weight - floor) / step;
  // Tolerate float noise so a weight that is already exact never jumps a whole step.
  const n = dir === 'up' ? Math.ceil(above - 1e-9) : Math.floor(above + 1e-9);
  return Math.round((floor + Math.max(0, n) * step) * 100) / 100;
}

function snapIncrement(weight: number, increment: number, minLoad: number, dir: 'up' | 'down'): number {
  if (increment <= 0) return Math.max(minLoad, weight);
  const above = (weight - minLoad) / increment;
  const n = dir === 'up' ? Math.ceil(above - 1e-9) : Math.floor(above + 1e-9);
  return Math.round((minLoad + Math.max(0, n) * increment) * 100) / 100;
}

/**
 * Builds the snapper for a lifter's equipment. Passed into the otherwise
 * settings-agnostic engine so those functions stay pure.
 */
export function makeSnapper(bar: BarSettings): LoadSnapper {
  return (weight, ex, dir) =>
    ex.equipment === 'barbell'
      ? snapBarbell(weight, bar, ex.minLoad, dir)
      : snapIncrement(weight, ex.increment, ex.minLoad, dir);
}

/** No-op snapper, for callers that have no equipment settings to hand. */
export const noSnap: LoadSnapper = (weight) => weight;
