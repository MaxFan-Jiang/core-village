# Architecture

> Engineering overview of **Core Village (芯覺村・村民出戰)** — a browser pixel-art auto-battler that anyone can contribute a character to with a single, CI-validated pull request.
>
> **Author:** Max Fan ([@MaxFan-Jiang](https://github.com/MaxFan-Jiang)) — engine, build pipeline, validation/security model, and game balance.
> **Contributors:** community members add **data-only** character cards under `villagers/` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

The interesting problem here isn't the game — it's letting **non-programmers safely contribute executable-looking content to a site that runs in everyone else's browser**, without a backend, without a build step on their machine, and without opening an XSS hole. That constraint drives every decision below.

---

## 1. Data flow

```
villagers/<id>.json   ──►  scripts/build-villagers.mjs  ──►  villagers.generated.js  ──►  index.html (engine)
 (contributor data)        (validate + aggregate)            (window.__VILLAGERS__)       (render + simulate)
        ▲                          │
        │                          └─ same script in --check mode = the PR CI gate
   one PR per person
```

- A contributor adds **one JSON file** describing their character. That's the entire contribution surface.
- The build script is the **single source of truth for what is allowed**. It runs in two modes:
  - `--check` (CI, on every PR): validate only, emit human-readable errors, fail red on any violation.
  - default (CI, on merge to `main`): re-aggregate every card into `villagers.generated.js`, which the engine loads.
- The engine itself (`index.html`) is a single dependency-free file: state machine, turn-based battle simulation, and a Canvas/DOM pixel renderer.

There is **no server**. The leaderboard is the only optional backend (§4) and the game is fully playable without it.

---

## 2. The contribution security model

Contributor strings end up in `innerHTML`, and a contributor's `id` / `skill` are used as DOM attributes and lookup keys. With untrusted input from arbitrary PRs, that is an XSS surface. It is closed with **defense in depth**, enforced at build time so a bad card can never reach `main`:

| Layer | Mechanism | Why |
|---|---|---|
| **Allowlist `id`** | `^[a-z0-9][a-z0-9-]{1,23}$` | `id` is interpolated raw into selectors/attributes — the regex *is* its escaping |
| **Allowlist `skill`** | fixed set of engine skills; `id` must equal the filename | a skill string is a key into the engine; no arbitrary values |
| **No custom code** | `skill: "custom"` is explicitly rejected | running PR-supplied code in every player's browser is the one thing we never do |
| **Markup ban** | free-text fields reject `<` / `>` | blocks tag injection in `name` / `job` / `cry` |
| **Range + length caps** | `hp/atk/spd/crit` bounded; per-field length limits | balance guardrail + payload-size guard |
| **Key stripping** | only known fields are copied into the output | a card cannot smuggle extra data into the bundle |
| **Runtime escape** | `esc()` re-escapes every contributor string on load | second layer behind the build-time gate |

The guiding invariant is written into the build script itself: *the `id` and `skill` allowlists are the only XSS defense for those two fields — never widen them without first adding escaping on the front end.*

Custom skills (contributor-authored behaviour) are deliberately **not** open: they would mean executing PR-supplied logic client-side. They are handled out-of-band via human code review instead.

---

## 3. CI/CD

Three GitHub Actions workflows, each with one job:

- **Validate (`validate.yml`)** — runs the build script in `--check` on every PR. Green = mergeable; red = the contributor gets specific, friendly error messages (in their language) telling them exactly which field to fix.
- **Scope guard (`pr-scope.yml`)** — a PR may only touch `villagers/`. Anything that reaches into the engine, CI, or config fails. This is both a security boundary (a malicious PR can't sneak an engine edit past review) and a clean separation between *authored code* and *contributed data*.
- **Build & deploy (`deploy.yml`)** — on merge to `main`, re-aggregate all cards and publish to GitHub Pages. A merged character is live within minutes.

First-time fork contributors are gated by GitHub's "require approval to run workflows" by default — the maintainer approves the run, then the validation/scope checks execute.

---

## 4. The leaderboard (optional, graceful)

`leaderboard.js` is written to work with **zero configuration** (local mode, `localStorage`) and upgrade to a **real-time shared board** (Firestore) the moment a project config is supplied — *no front-end code changes*. If the backend is unreachable, it silently falls back to local mode and logs a single warning rather than erroring.

Security for the shared board lives in `firestore.rules` (public-read, validated-write, no edit/delete of others' scores), **not** in hiding the web config (Firebase web keys are public by design). Known, honestly-documented limit: without auth, in-range score spoofing is possible — acceptable for a friendly community board; tightened later with App Check / auth if needed.

---

## 5. Game engine notes

- **Render once, update in place.** The stage DOM is built a single time; each frame only mutates existing nodes (`paintAll()`) — a full `innerHTML` repaint would wipe in-flight animations. This is the one rule that keeps the pixel animation smooth.
- **Closed-loop balance.** Player power has diminishing-returns caps; enemies scale until the team hits a wall and loses. The design goal is a *beatable but finite* run, not unbounded snowball — tuned through extensive playtesting.
- **Data-driven characters.** Stats, skill, and appearance all come from the card data; per-character visual overrides are supported by the engine (proven by the all-black "dark" variant), which is the hook for richer contributor visuals.

---

## 6. Stack

Vanilla JavaScript (ES modules), no framework, no runtime dependencies. Canvas + DOM for pixel rendering. Node only for the build/validation script. GitHub Actions for CI/CD, GitHub Pages for hosting, optional Firebase/Firestore for the shared leaderboard.

The deliberate absence of a framework and a backend is the point: the whole thing is auditable in an afternoon, and the contribution path stays a single JSON file.
