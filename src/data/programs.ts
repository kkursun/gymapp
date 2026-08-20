import type { Program } from '../types';

const s = (sets: number, reps: number) => ({ sets, reps });

/**
 * Three programs, each runnable in an ordinary commercial gym. The lifter is placed on
 * one at onboarding and promoted upward by the graduation engine as linear progress
 * runs out — nobody has to know what to pick.
 */
export const PROGRAMS: Program[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    tagline: 'Machines & dumbbells · 3 days a week',
    description:
      'Builds the base without asking you to balance a barbell on day one. Every movement is a machine or a dumbbell, so a missed rep just means setting the weight down. Most people spend 6–10 weeks here before moving to the barbell.',
    daysPerWeek: 3,
    level: 1,
    requires: ['dumbbell', 'machine', 'cable'],
    graduatesTo: ['strength-5x5'],
    days: [
      {
        id: 'A',
        name: 'Day A',
        slots: [
          { exerciseId: 'goblet-squat', scheme: s(3, 10) },
          { exerciseId: 'db-bench', scheme: s(3, 10) },
          { exerciseId: 'seated-row', scheme: s(3, 10) },
          { exerciseId: 'plank', scheme: s(3, 30) },
        ],
      },
      {
        id: 'B',
        name: 'Day B',
        slots: [
          { exerciseId: 'leg-press', scheme: s(3, 10) },
          { exerciseId: 'db-shoulder-press', scheme: s(3, 10) },
          { exerciseId: 'lat-pulldown', scheme: s(3, 10) },
          { exerciseId: 'leg-curl', scheme: s(3, 12) },
        ],
      },
    ],
  },
  {
    id: 'strength-5x5',
    name: 'Strength 5×5',
    tagline: 'Barbell · 3 days a week',
    description:
      'The classic beginner barbell program. Two alternating days, five sets of five, and the weight goes up every single session you complete. This is where most of your first year of strength comes from.',
    daysPerWeek: 3,
    level: 2,
    requires: ['barbell'],
    graduatesTo: ['upper-lower'],
    days: [
      {
        id: 'A',
        name: 'Day A',
        slots: [
          { exerciseId: 'squat', scheme: s(5, 5) },
          { exerciseId: 'bench', scheme: s(5, 5) },
          { exerciseId: 'row', scheme: s(5, 5) },
        ],
      },
      {
        id: 'B',
        name: 'Day B',
        slots: [
          { exerciseId: 'squat', scheme: s(5, 5) },
          { exerciseId: 'ohp', scheme: s(5, 5) },
          { exerciseId: 'deadlift', scheme: s(1, 5) },
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    tagline: 'Barbell + accessories · 4 days a week',
    description:
      'For when 5×5 stops going up every session. More volume per muscle, more recovery between heavy days, and accessory work to fill the gaps the big lifts leave. Progression slows down here — that is expected, not a problem.',
    daysPerWeek: 4,
    level: 3,
    requires: ['barbell', 'dumbbell', 'cable'],
    graduatesTo: [],
    days: [
      {
        id: 'L1',
        name: 'Lower A',
        slots: [
          { exerciseId: 'squat', scheme: s(4, 5) },
          { exerciseId: 'romanian-deadlift', scheme: s(3, 8) },
          { exerciseId: 'leg-curl', scheme: s(3, 12) },
          { exerciseId: 'hanging-knee-raise', scheme: s(3, 10) },
        ],
      },
      {
        id: 'U1',
        name: 'Upper A',
        slots: [
          { exerciseId: 'bench', scheme: s(4, 5) },
          { exerciseId: 'row', scheme: s(4, 6) },
          { exerciseId: 'db-shoulder-press', scheme: s(3, 10) },
          { exerciseId: 'face-pull', scheme: s(3, 15) },
        ],
      },
      {
        id: 'L2',
        name: 'Lower B',
        slots: [
          { exerciseId: 'deadlift', scheme: s(3, 5) },
          { exerciseId: 'leg-press', scheme: s(3, 10) },
          { exerciseId: 'goblet-squat', scheme: s(3, 12) },
          { exerciseId: 'plank', scheme: s(3, 45) },
        ],
      },
      {
        id: 'U2',
        name: 'Upper B',
        slots: [
          { exerciseId: 'ohp', scheme: s(4, 5) },
          { exerciseId: 'lat-pulldown', scheme: s(4, 8) },
          { exerciseId: 'incline-db-press', scheme: s(3, 10) },
          { exerciseId: 'db-curl', scheme: s(3, 12) },
          { exerciseId: 'triceps-pushdown', scheme: s(3, 12) },
        ],
      },
    ],
  },
];

export const PROGRAM_MAP: Record<string, Program> = Object.fromEntries(PROGRAMS.map((p) => [p.id, p]));

export function getProgram(id: string): Program {
  const p = PROGRAM_MAP[id];
  if (!p) throw new Error(`Unknown program: ${id}`);
  return p;
}
