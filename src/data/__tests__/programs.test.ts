import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '../programs';
import { EXERCISES, getExercise } from '../exercises';
import type { MuscleGroup } from '../../types';

/** Every exercise a program's days reference, deduplicated. */
const exerciseIds = (programId: string) => {
  const p = PROGRAMS.find((x) => x.id === programId)!;
  return [...new Set(p.days.flatMap((d) => d.slots.map((s) => s.exerciseId)))];
};

describe('program integrity', () => {
  it('references only exercises that exist', () => {
    for (const p of PROGRAMS) {
      for (const day of p.days) {
        for (const slot of day.slots) {
          expect(() => getExercise(slot.exerciseId)).not.toThrow();
        }
      }
    }
  });

  it('gives every program a sane shape', () => {
    for (const p of PROGRAMS) {
      expect(p.days.length).toBeGreaterThan(0);
      for (const day of p.days) {
        expect(day.slots.length).toBeGreaterThanOrEqual(3);
        for (const slot of day.slots) {
          expect(slot.scheme.sets).toBeGreaterThan(0);
          expect(slot.scheme.reps).toBeGreaterThan(0);
        }
      }
      // Day ids must be unique, or the rotation and history lookups collide.
      expect(new Set(p.days.map((d) => d.id)).size).toBe(p.days.length);
    }
  });

  it('promotes only to programs that exist', () => {
    const ids = new Set(PROGRAMS.map((p) => p.id));
    for (const p of PROGRAMS) {
      for (const next of p.graduatesTo) expect(ids.has(next)).toBe(true);
    }
  });
});

describe('every program covers the basic movement patterns', () => {
  // A beginner program that quietly omits a whole pattern — no pressing, no pulling — is
  // a real defect, and one a lifter would only notice weeks in.
  const PATTERNS: { label: string; matches: (id: string) => boolean }[] = [
    { label: 'horizontal press', matches: (id) => /bench/.test(id) },
    { label: 'vertical press', matches: (id) => /ohp|shoulder-press/.test(id) },
    { label: 'horizontal pull', matches: (id) => /row|pulldown/.test(id) },
    { label: 'squat pattern', matches: (id) => /squat|leg-press/.test(id) },
    { label: 'hip hinge', matches: (id) => /deadlift|leg-curl/.test(id) },
  ];

  for (const program of PROGRAMS) {
    it(`${program.name} trains every pattern`, () => {
      const ids = exerciseIds(program.id);
      for (const pattern of PATTERNS) {
        expect(ids.some(pattern.matches), `${program.name} has no ${pattern.label}`).toBe(true);
      }
    });

    it(`${program.name} covers the major muscle groups`, () => {
      const groups = new Set<MuscleGroup>(
        exerciseIds(program.id).map((id) => getExercise(id).primary),
      );
      for (const required of ['legs', 'chest', 'back', 'shoulders'] as MuscleGroup[]) {
        expect(groups.has(required), `${program.name} never trains ${required}`).toBe(true);
      }
    });
  }
});

describe('program equipment claims', () => {
  it('only claims equipment it actually uses, and uses only what it claims', () => {
    for (const p of PROGRAMS) {
      const used = new Set(exerciseIds(p.id).map((id) => getExercise(id).equipment));
      for (const required of p.requires) {
        expect(used.has(required), `${p.name} requires ${required} but never uses it`).toBe(true);
      }
      // Bodyweight movements need no equipment, so they are exempt from the reverse check.
      for (const equipment of used) {
        if (equipment === 'bodyweight') continue;
        expect(p.requires.includes(equipment), `${p.name} uses ${equipment} without requiring it`).toBe(true);
      }
    }
  });

  it('keeps rack-free programs free of barbells', () => {
    for (const p of PROGRAMS) {
      if (p.requires.includes('barbell')) continue;
      const equipment = exerciseIds(p.id).map((id) => getExercise(id).equipment);
      expect(equipment).not.toContain('barbell');
    }
  });
});

describe('exercise library integrity', () => {
  it('gives every exercise cues and a workable increment', () => {
    for (const ex of Object.values(EXERCISES)) {
      expect(ex.cues.length).toBeGreaterThan(0);
      expect(ex.minLoad).toBeGreaterThanOrEqual(0);
      if (ex.standard.kind === 'bodyweight') {
        expect(ex.increment).toBe(0);
      } else {
        expect(ex.increment).toBeGreaterThan(0);
      }
    }
  });

  it('points every estimated standard at a lift that has a published one', () => {
    for (const ex of Object.values(EXERCISES)) {
      if (ex.standard.kind !== 'estimated') continue;
      const anchor = getExercise(ex.standard.of);
      expect(anchor.standard.kind).toBe('published');
      expect(ex.standard.fraction).toBeGreaterThan(0);
    }
  });
});
