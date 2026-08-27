# Ironpath

A gym tracker for people who have never lifted before. The programs are built in, the
starting weights come from your body, and the weight on the bar goes up — or comes back
down — on its own. You log reps; the app decides everything else.

Installable web app (PWA): works offline, runs from your phone's home screen, and stores
everything on-device. No account, no server, no data leaves the phone.

## The idea

A beginner's two hardest questions are *what do I do* and *how much do I lift*. Ironpath
answers both and keeps answering them as you get stronger:

1. **Onboarding** takes your sex, age, height, bodyweight and experience, and picks a
   program plus a starting weight for every lift.
2. **Every session** you tap the sets you completed. Hit all your reps and the weight goes
   up next time. Miss them and it repeats. Miss three sessions running and it deloads 10%
   so you can build back with clean reps.
3. **When a program runs out of road**, the app notices and offers you the next one,
   carrying your weights across.

Anything you do on top of the program — an extra set, a lift it never asked for, a session
in the garage — can be logged by hand. It counts toward your records without ever being
allowed to hold a lift back. See [Logging what you actually did](#logging-what-you-actually-did).

## How the numbers are derived

Starting weights are not a generic chart. Each lift's target is computed from four terms,
three of which come from published sources rather than from us:

```
novice 1RM  =  published novice ratio × 90kg      (level)
            ×  (your lean mass / reference)^(2/3)  (size)
            ×  sex factor                          (sex)
            ×  age factor                          (age)
```

**Level** — novice one-rep-max standards as a multiple of bodyweight, from aggregate
lifting-standards tables: squat 1.25×, bench 0.75×, deadlift 1.5×, overhead press 0.55×
for a 90kg man. "Novice" means roughly three to six months of consistent training, which
is what a beginner program is built to deliver.

**Size** — strength tracks muscle cross-sectional area, which scales as mass^(2/3), not
mass. This is the allometric law underlying the Wilks, DOTS and Sinclair formulas. It is
applied to **lean** mass (Boer formula), which is why height is asked for: two people at
90kg but 25cm apart carry very different amounts of muscle.

Lean mass rather than bodyweight is a deliberate choice. The empirical curves fitted to
competition bodyweight show an exponent well below 2/3 (DOTS implies ≈0.4–0.55), because
heavier competitors carry proportionally more fat. Once fat is removed, the geometric 2/3
exponent is the correct one — applying the empirical curve *as well* would count the same
correction twice. A test cross-checks our curve against the DOTS polynomial and requires
agreement within 20% across 60–120kg.

**Age** — the Foster (ages 14–23) and McCulloch (40+) age-grading coefficients used in
masters powerlifting, inverted: those tables exist to scale an older lifter's total *up*
to a peak-age equivalent, so their reciprocal is the fraction of peak strength expected at
that age. Ages 24–39 are peak, with no adjustment. This replaced a linear taper we had
invented, which was roughly right at 50 and badly wrong at 70 (0.76 vs the correct 0.61).

**Sex** — published tables put women at about 75–85% of men on lower-body lifts and 60–70%
on upper body at the same bodyweight. Lean mass explains a few points of that on its own,
so the residual is applied on top and tests assert the combined result lands inside the
published bands.

### What is ours rather than published

Being clear about this, because it matters:

- Only squat, bench, deadlift and overhead press have published ratios. **Every other
  lift** — rows, pulldowns, machines, dumbbell work — is estimated as a fraction of one
  that does, and those fractions are our judgement. The distinction is encoded in the
  data itself (`{ kind: 'published' }` vs `{ kind: 'estimated' }`), not buried in a
  comment.
- The experience factors (how far below the standard you start) and the graduation
  thresholds are chosen because they behave sensibly, not derived from data.
- The standards tables themselves are aggregated from self-reported lifting-app data, not
  a controlled study. They are good population averages and nothing more.

None of this is medically validated, and none of it knows about your injuries, sleep, or
how a set actually felt. Every weight has ± buttons for that reason.

## Keeping it current

Your body changes, so the app asks. It prompts for a **weigh-in weekly**, and re-checks
**height every six months** (every two months if you're under 20 and still growing). New
measurements update your lean-mass estimate, which moves every strength target with you.
"Not now" defers the prompt for a couple of days.

## Programs

| Program | Equipment | Days | For |
| --- | --- | --- | --- |
| **Foundation** | Machines + dumbbells | 3 | The first 6–10 weeks, or any gym without a rack |
| **Strength 5×5** | Barbell | 3 | The main event — where most of your first year of strength comes from |
| **Upper / Lower** | Barbell + accessories | 4 | Once 5×5 stops going up every session |
| **Momentum** | Barbell + accessories | 4 | Once linear progression is finished for good — everything on rep ranges |

All three are runnable in an ordinary commercial gym.

### Training days

The days-per-week answer is never silently overridden. If the recommended program runs on
a different schedule than you asked for, onboarding says so, explains why, and offers a
program that matches your days in one tap.

A beginner who picks 4 days is still *recommended* 3-day 5×5 — full-body sessions that add
weight every time are about as much as a novice recovers from, and the fourth day buys
less than sleeping and eating does. But that is a recommendation with its reasoning shown,
not a decision made behind your back: Upper/Lower is one button away.

### How you get promoted

- **Foundation → 5×5**: ~18 sessions or 6 weeks in, once you're using real weight on the
  goblet squat. Never offered if your gym has no rack.
- **5×5 → Upper/Lower**: whichever comes first — three deloads across your main lifts
  (linear progression is genuinely finished), 60 sessions, or clearing the novice standard
  on most of the program's main lifts. Clearing the standards promotes you immediately;
  there is no session quota on top of it.

A standard counts as cleared only on weight you have **demonstrated** — completed every
prescribed rep at. Loading the bar heavier without lifting it moves nothing.
- **Upper/Lower → Momentum**: four deloads across the main lifts, or 100 sessions. At that
  point extra recovery has stopped rescuing linear progression, and the answer is rep
  ranges rather than more weight.

Momentum is the last program, and unlike the others that is not a ceiling: double
progression keeps generating new targets indefinitely, so there is nothing further to
graduate to.

You can always decline and stay put, or override the program entirely in Settings.

## Progression rules

Two models, chosen by the program rather than by you.

**Linear** — a fixed rep target, used for the main barbell lifts in the beginner programs.
Fast while it lasts, which for a novice is months.

| Situation | What happens |
| --- | --- |
| All prescribed reps completed | +5kg lower body, +2.5kg upper body |
| Any set short of target | Repeat the same weight next session |
| Third consecutive miss | Deload to 90%, rounded to the plates you have |
| Already at the lightest the lift goes | Hold — no pointless deload of an empty bar |
| Exercise skipped or untouched | Nothing changes; it isn't counted as a failure |

**Double progression** — a rep *range* (say 3×8–12), used for all accessory work, every
bodyweight movement, and every lift in Momentum. Reps climb before weight does, so the
lift keeps advancing long after adding plates every session has stopped working.

| Situation | What happens |
| --- | --- |
| All reps at the current target | +1 rep next session, same weight (planks move in 5s) |
| Reached the top of the range | Weight goes up, reps reset to the bottom |
| Third consecutive miss | Rep target resets to the bottom — the weight is left alone |
| Missed at the bottom of the range | Falls back to a normal 10% weight deload |
| Bodyweight lift at the top of its range | Holds, and tells you to move to a harder variation |

Override the weight in the gym and the app judges what you actually lifted, not what it
planned for you.

## Logging what you actually did

The program prescribes; it does not police. Everything below is entered by hand, and none
of it can be entered wrongly enough to break the progression.

- **Extra sets** — *+ Add set* on any lift adds a set beyond the prescription. It is drawn
  with a dashed border and marked as yours.
- **Any rep number** — the rep sheet keeps its quick grid around the target, and adds a
  stepper underneath for numbers the grid does not reach: a set of 25 push-ups, a
  three-minute plank.
- **A lift the program never asked for** — *+ Add a lift* mid-session pulls anything from
  the exercise library onto the card. Outside a session, *+ Log an extra lift* on the home
  screen records work done elsewhere; a day's worth collects into one entry in History.
- **Corrections** — tap any lift inside a past session in History to fix the reps you
  logged.

**How hand-logged work is treated.** It counts toward your records — best set, estimated
1RM — and toward total volume, but only the sets the *program* prescribed decide whether a
lift goes up, holds, or deloads:

| | Counts for records | Decides progression |
| --- | --- | --- |
| Prescribed sets | yes | yes |
| Extra sets you added | yes | no |
| A lift you added yourself | yes | no — there is no prescription to hit |
| Corrections in History | no — the weights were already decided | no |

The asymmetry is deliberate. A fourth set taken to failure is training, not evidence that
the first three were missed, so it can never turn a completed session into a miss or push
a lift toward a deload. For the same reason an extra set cannot claim a personal-best
*weight*: that is reserved for a session actually completed at that load.

Lifts logged outside the rotation are real training, but they are not program sessions.
They do not advance the day rotation, count toward the weekly target, or feed graduation —
a fortnight of curls in the garage is not evidence that 5×5 has been outgrown.

## Also in the box

- **Plate calculator** — what to hang on each end, using only the plates your gym owns.
- **Rest timer** — wall-clock anchored so it survives the screen sleeping, with a beep and
  a vibrate.
- **Form cues** on every exercise, plus notes specific to your build (long femurs, short
  arms, pulling from blocks if you're tall).
- **Progress charts** — working weight per lift, bodyweight, and how close each main lift
  is to your personal novice standard.
- **Export / import** your data as JSON. It only lives on this device, so take a backup.

## Installing it on your phone

The app installs from a web page, so it needs to be served over HTTPS first — browsers
only offer "install" on a secure origin.

**Hosted (what you want):** pushing to the default branch runs the included GitHub Actions
workflow, which tests, builds, enables Pages if it isn't already, and publishes to
`https://<user>.github.io/gymapp/`. Everything in the build is path-relative, so the
subdirectory is fine.

Then, on the phone:

- **iPhone (Safari — it must be Safari):** open the URL, tap Share, then *Add to Home
  Screen*.
- **Android (Chrome):** open the URL and either accept the install banner or use the ⋮
  menu → *Install app* / *Add to Home screen*.

It then launches full-screen with no browser chrome, and works with no signal.

**Local testing without hosting:** `npm run build && npm run preview -- --host` and open
the printed LAN address on your phone. The app runs, but plain-HTTP origins can't be
installed — for that you need the HTTPS URL above.

Your data lives in that browser's storage. It does not follow you between the installed
app and the browser tab, or to another phone — use *Settings → Export* to move it.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # 80 tests over the progression, graduation and check-in engines
npm run build      # generates icons, typechecks, bundles to dist/
npm run preview    # serve the production build
```

### Layout

```
src/
  data/        exercises and the three programs — pure data
  engine/      the parts worth trusting: body metrics, starting weights,
               progression, graduation, check-ins, plate maths
  store/       reducer + localStorage persistence
  screens/     onboarding, home, workout, progress, history, settings, promotion
  components/  shared UI, chart, rest timer, check-in card
```

The `engine/` directory is deliberately free of React and side effects — all of it is
plain functions over plain data, which is why it can be tested exhaustively.
