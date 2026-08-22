import { describe, expect, it } from 'vitest';
import { EXERCISES, getExercise } from '../../data/exercises';
import { getProgram, PROGRAMS } from '../../data/programs';
import {
  programExerciseIds,
  resolveId,
  resolveSlots,
  substitutesFor,
  withSubstitution,
} from '../substitution';

const withRack = { hasRack: true };

describe('substitutesFor', () => {
  it('offers something for every lift the programs prescribe', () => {
    const prescribed = new Set(
      PROGRAMS.flatMap((p) => p.days.flatMap((d) => d.slots.map((s) => s.exerciseId))),
    );
    for (const id of prescribed) {
      expect(substitutesFor(id, withRack).length, `no substitutes for ${id}`).toBeGreaterThan(0);
    }
  });

  it('never offers the lift itself', () => {
    for (const id of Object.keys(EXERCISES)) {
      expect(substitutesFor(id, withRack).map((e) => e.id)).not.toContain(id);
    }
  });

  it('never crosses between loaded and bodyweight movements', () => {
    // The two progress by different rules and the program's scheme is written for one or
    // the other, so a swap across that line would quietly stop the lift progressing.
    for (const id of Object.keys(EXERCISES)) {
      const loaded = getExercise(id).standard.kind !== 'bodyweight';
      for (const option of substitutesFor(id, withRack)) {
        expect(option.standard.kind !== 'bodyweight').toBe(loaded);
      }
    }
  });

  it('hides barbell lifts from a lifter with no rack', () => {
    for (const id of Object.keys(EXERCISES)) {
      const options = substitutesFor(id, { hasRack: false });
      expect(options.every((o) => o.equipment !== 'barbell')).toBe(true);
    }
  });

  it('excludes lifts already in the same session', () => {
    const options = substitutesFor('leg-press', { hasRack: true, exclude: ['goblet-squat'] });
    expect(options.map((o) => o.id)).not.toContain('goblet-squat');
  });

  it('puts an exact pattern match ahead of a merely compatible one', () => {
    const options = substitutesFor('row', withRack);
    const exact = options.findIndex((o) => o.pattern === 'horizontal-pull');
    const compatible = options.findIndex((o) => o.pattern === 'vertical-pull');
    expect(exact).toBeGreaterThanOrEqual(0);
    if (compatible >= 0) expect(exact).toBeLessThan(compatible);
  });

  it('treats the two pull patterns as interchangeable', () => {
    expect(substitutesFor('lat-pulldown', withRack).map((o) => o.id)).toContain('seated-row');
    expect(substitutesFor('seated-row', withRack).map((o) => o.id)).toContain('lat-pulldown');
  });

  it('keeps pressing patterns apart — a bench is not an overhead press', () => {
    expect(substitutesFor('bench', withRack).map((o) => o.id)).not.toContain('ohp');
    expect(substitutesFor('ohp', withRack).map((o) => o.id)).not.toContain('bench');
  });
});

describe('resolving substitutions', () => {
  it('leaves slots alone when nothing is substituted', () => {
    const day = getProgram('strength-5x5').days[0];
    expect(resolveSlots(day, {})).toEqual(day.slots);
  });

  it('rewrites only the substituted slot, keeping its scheme', () => {
    const day = getProgram('strength-5x5').days[0];
    const slots = resolveSlots(day, { bench: 'db-bench' });
    expect(slots.map((s) => s.exerciseId)).toEqual(['squat', 'db-bench', 'row']);
    expect(slots[1].scheme).toEqual(day.slots[1].scheme);
  });

  it('ignores a swap pointing at an exercise that no longer exists', () => {
    expect(resolveId('bench', { bench: 'ghost-lift' })).toBe('bench');
  });

  it('ignores a swap onto itself', () => {
    expect(resolveId('bench', { bench: 'bench' })).toBe('bench');
  });

  it('reports the substituted lift as part of the program', () => {
    const ids = programExerciseIds(getProgram('strength-5x5'), { bench: 'chest-press-machine' });
    expect(ids).toContain('chest-press-machine');
    expect(ids).not.toContain('bench');
  });

  it('drops a no-op substitution rather than storing it', () => {
    expect(withSubstitution({}, 'bench', 'bench')).toEqual({});
    expect(withSubstitution({}, 'bench', 'ghost-lift')).toEqual({});
    expect(withSubstitution({ bench: 'db-bench' }, 'bench', 'bench')).toEqual({});
  });

  it('records a real substitution', () => {
    expect(withSubstitution({}, 'bench', 'db-bench')).toEqual({ bench: 'db-bench' });
  });

  it('never puts the same lift into a day twice', () => {
    // Offering a lift the day already trains would produce two slots with one exercise id,
    // which the session log cannot represent.
    for (const program of PROGRAMS) {
      for (const day of program.days) {
        const ids = day.slots.map((s) => s.exerciseId);
        for (const id of ids) {
          const options = substitutesFor(id, { hasRack: true, exclude: ids.filter((x) => x !== id) });
          for (const option of options) {
            const resolved = resolveSlots(day, { [id]: option.id }).map((s) => s.exerciseId);
            expect(new Set(resolved).size, `${program.id}/${day.id}: ${id} -> ${option.id}`).toBe(
              resolved.length,
            );
          }
        }
      }
    }
  });
});
