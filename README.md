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

## Why height and weight, not just weight

Starting weights are derived from **lean body mass** (Boer formula), not bodyweight. Two
people who both weigh 90kg but stand 165cm and 190cm carry very different amounts of
muscle, and the taller one is meaningfully stronger. Bodyweight alone can't see that.

```
lean mass  →  × exercise's novice-standard ratio
           →  × age factor          (peaks in your 20s, tapers slowly after 30)
           →  × experience factor   (how close to that standard you start)
           →  rounded down to a weight the plates can actually make
```

Everyone starts well below their own standard on purpose — the first weeks are for
learning the movement, and starting light is what buys you months of easy progress
instead of two weeks of it.

BMI and age also feed **program selection**: a complete beginner who is 50+, or carrying
enough weight that loaded spinal work is unpleasant on day one, starts on machines and
dumbbells instead of under a barbell.

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

All three are runnable in an ordinary commercial gym.

### How you get promoted

- **Foundation → 5×5**: ~18 sessions or 6 weeks in, once you're using real weight on the
  goblet squat. Never offered if your gym has no rack.
- **5×5 → Upper/Lower**: whichever comes first — three deloads across your main lifts
  (linear progression is genuinely finished), 60 sessions, or your squat, bench and
  deadlift all clearing the novice standard for your size.

You can always decline and stay put, or override the program entirely in Settings.

## Progression rules

| Situation | What happens |
| --- | --- |
| All prescribed reps completed | +5kg lower body, +2.5kg upper body |
| Any set short of target | Repeat the same weight next session |
| Third consecutive miss | Deload to 90%, rounded to the plates you have |
| Already at the lightest the lift goes | Hold — no pointless deload of an empty bar |
| Exercise skipped or untouched | Nothing changes; it isn't counted as a failure |

Override the weight in the gym and the app judges what you actually lifted, not what it
planned for you.

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
