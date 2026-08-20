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
