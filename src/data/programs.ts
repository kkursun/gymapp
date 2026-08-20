import type { Program } from '../types';

const s = (sets: number, reps: number) => ({ sets, reps });
/** Double progression: work up from `reps` to `maxReps`, then add weight and reset. */
const range = (sets: number, reps: number, maxReps: number, repStep = 1) => ({
  sets,
  reps,
  maxReps,
  repStep,
});

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
          { exerciseId: 'goblet-squat', scheme: range(3, 8, 12) },
          { exerciseId: 'db-bench', scheme: range(3, 8, 12) },
          { exerciseId: 'seated-row', scheme: range(3, 8, 12) },
          { exerciseId: 'plank', scheme: range(3, 20, 60, 5) },
        ],
      },
      {
        id: 'B',
        name: 'Day B',
        slots: [
          { exerciseId: 'leg-press', scheme: range(3, 8, 12) },
          { exerciseId: 'db-shoulder-press', scheme: range(3, 8, 12) },
          { exerciseId: 'lat-pulldown', scheme: range(3, 8, 12) },
          { exerciseId: 'leg-curl', scheme: range(3, 10, 15) },
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
    requires: ['barbell', 'dumbbell', 'cable', 'machine'],
    graduatesTo: ['momentum'],
    days: [
      {
        id: 'L1',
        name: 'Lower A',
        slots: [
          { exerciseId: 'squat', scheme: s(4, 5) },
          { exerciseId: 'romanian-deadlift', scheme: range(3, 6, 10) },
          { exerciseId: 'leg-curl', scheme: range(3, 10, 15) },
          { exerciseId: 'hanging-knee-raise', scheme: range(3, 6, 15) },
        ],
      },
      {
        id: 'U1',
        name: 'Upper A',
        slots: [
          { exerciseId: 'bench', scheme: s(4, 5) },
          { exerciseId: 'row', scheme: s(4, 6) },
          { exerciseId: 'db-shoulder-press', scheme: range(3, 8, 12) },
          { exerciseId: 'face-pull', scheme: range(3, 12, 20) },
        ],
      },
      {
        id: 'L2',
        name: 'Lower B',
        slots: [
          { exerciseId: 'deadlift', scheme: s(3, 5) },
          { exerciseId: 'leg-press', scheme: range(3, 8, 12) },
          { exerciseId: 'goblet-squat', scheme: range(3, 10, 15) },
          { exerciseId: 'plank', scheme: range(3, 30, 90, 5) },
        ],
      },
      {
        id: 'U2',
        name: 'Upper B',
        slots: [
          { exerciseId: 'ohp', scheme: s(4, 5) },
          { exerciseId: 'lat-pulldown', scheme: s(4, 8) },
          { exerciseId: 'incline-db-press', scheme: range(3, 8, 12) },
          { exerciseId: 'db-curl', scheme: range(3, 10, 15) },
          { exerciseId: 'triceps-pushdown', scheme: range(3, 10, 15) },
        ],
      },
    ],
  },
  {
    id: 'momentum',
    name: 'Momentum',
    tagline: 'Barbell + accessories · 4 days a week',
    description:
      'Where you go once adding weight every session has stopped working for good. Every lift now runs on a rep range: you work up from the bottom of the range to the top at one weight, then add weight and start again. Progress is slower per session and it does not run out — this is how people train for years rather than months.',
    daysPerWeek: 4,
    level: 3,
    requires: ['barbell', 'dumbbell', 'cable', 'machine'],
    graduatesTo: [],
    days: [
      {
        id: 'L1',
        name: 'Lower A',
        slots: [
          { exerciseId: 'squat', scheme: range(4, 4, 6) },
          { exerciseId: 'romanian-deadlift', scheme: range(3, 6, 10) },
          { exerciseId: 'leg-press', scheme: range(3, 8, 12) },
          { exerciseId: 'hanging-knee-raise', scheme: range(3, 6, 15) },
        ],
      },
      {
        id: 'U1',
        name: 'Upper A',
        slots: [
          { exerciseId: 'bench', scheme: range(4, 4, 6) },
          { exerciseId: 'row', scheme: range(4, 6, 10) },
          { exerciseId: 'db-shoulder-press', scheme: range(3, 8, 12) },
          { exerciseId: 'face-pull', scheme: range(3, 12, 20) },
        ],
      },
      {
        id: 'L2',
        name: 'Lower B',
        slots: [
          { exerciseId: 'deadlift', scheme: range(3, 3, 5) },
          { exerciseId: 'goblet-squat', scheme: range(3, 10, 15) },
          { exerciseId: 'leg-curl', scheme: range(3, 10, 15) },
          { exerciseId: 'plank', scheme: range(3, 30, 90, 5) },
        ],
      },
      {
        id: 'U2',
        name: 'Upper B',
        slots: [
          { exerciseId: 'ohp', scheme: range(4, 4, 6) },
          { exerciseId: 'lat-pulldown', scheme: range(4, 8, 12) },
          { exerciseId: 'incline-db-press', scheme: range(3, 8, 12) },
          { exerciseId: 'db-curl', scheme: range(3, 10, 15) },
          { exerciseId: 'triceps-pushdown', scheme: range(3, 10, 15) },
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
