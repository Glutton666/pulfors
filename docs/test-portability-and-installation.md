# Installation and portable test contracts

## One root install contract

The root Expo app, CI, post-merge setup and EAS uploads use `package-lock.json`
and `npm ci`. Use Node 22 in CI (EAS currently specifies compatible Node 20.19.4)
and npm 10. The root package manager declaration records npm 10.9.9.
The mockup sandbox is a separate package; do not merge its dependency graph
into the application or remove its own lock files.

The root Yarn/pnpm locks were retired only after a fresh npm installation
succeeded in an empty directory whose path contained spaces. All direct
dependency ranges and direct locked versions were preserved. Yarn's existing
security/compatibility resolutions became npm overrides, rather than silently
losing them. This corrects the old npm graph's PostCSS 8.4.49 to the already
Yarn-selected 8.5.33 and uses the already-selected autocomplete 3.2.40; PostCSS's
required nanoid/source-map-js dependencies consequently follow that graph.
This is not an unrelated dependency upgrade or a completed security audit.

`npm ci` must work without `--legacy-peer-deps`. Do not use that flag to conceal
peer incompatibilities. Keep native audio API / Worklets / Reanimated upgrades
deliberate.

Transport URLs must work outside the development sandbox. If tooling rewrites
them, run:

```sh
node scripts/normalize-npm-registry.cjs --registry https://registry.npmjs.org --write
```

This only repairs known sandbox URL prefixes; versions and integrity hashes
are preserved. Unexpected registries fail the install-contract test rather
than being silently accepted. Never use transport repair to bypass a blocked
vulnerable dependency.

## Line endings and execution environments

`.gitattributes` sets text to LF, explicitly preserves binary assets and keeps
Windows command files CRLF. No bulk renormalization of unrelated work is needed.
The Jest command no longer passes POSIX single quotes to Windows cmd.exe.
Native bundle outputs use the ignored, portable `generated-artifacts/` path.

The Windows workflow checks a checkout under `workspace with spaces`, runs
unit/type checks in UTC and Asia/Seoul, and runs targeted notebook/navigation
browser checks with failure artifacts. Defining this workflow does **not**
establish that a Windows run passed; inspect the actual run before saying so.

Browser locale/timezone are pinned to en-US/UTC. Individual tests may override
language intentionally. The language detection test separately pins its Intl
fallback; it must not infer the expected language from the developer's machine.
CRLF/LF and path-space fixtures exercise the retained source-contract reader.

## Which tests should read source?

Data formats, binary assets, dependency policies, module boundaries and explicit
size budgets can legitimately read files. UI behavior cannot be established by
matching a variable name, comment, whitespace or callback's spelling.

Converted core checks:

| Contract | Actual verification |
| --- | --- |
| Mode dial selection, arrows, confirmation, Escape/focus and header clearance | `e2e/mode-dial-accessibility.spec.ts` |
| Score list/editor close buttons | `e2e/score-exit.spec.ts` |
| Android back branches and latest return state | `tests/screen-navigation-behavior.test.ts` |
| Beat/Bar canonical strong notes, UI/engine profile restoration, BPM isolation and mode setters | `tests/bar-profile-behavior.test.ts` |
| Native back subscription ownership | Syntax-tree guard in `tests/screen-navigation-hook.test.ts` |

The syntax-tree guard accepts formatting, CRLF, import aliases and comments.
Its fixture also verifies that missing/duplicate executable registrations are
detected. It complements, not replaces, the installed-listener behavior tests.

### Retained source-reading inventory

The initial audit found 33 root test files with direct file reads. This was a
candidate list, **not 33 proven bad tests**. Some files mix real behavior and
source inspection:

| Group | Files | Treatment |
| --- | --- | --- |
| Public formats, asset bytes, removal/security and budgets | `audio-migration-guardrails`, `location-permission-config`, `metronome-screen-size-budget`, `metronome-sound-loudness`, `metronome-tone-dsp`, `npm-install-contract`, `pulse-click-assets`, `server-security`, `sound-assets`, `stem-separation-removal`, `tokens-regression` | Keep intentional policy/format checks; do not claim they exercise runtime UI. |
| Module ownership | `random-bar-session-hook`, `screen-navigation-hook`, `stage-composition-hook`, `subdivision-editor-hook` | Keep extraction/budget guards; the back-subscription guard now inspects syntax rather than source spelling. |
| Mixed runtime and parent wiring | `bar-mode-bpm-profile-isolation`, `bar-mode-config-isolation`, `fade-out`, `modal-routing`, `prerender-playback-reliability`, `sample-tap-tempo`, `stage-mode-exit` | Core Bar/navigation checks now execute real hooks. Preserve remaining parent-wiring checks until equivalent integration coverage exists; the measured CRLF-sensitive Bar guard now normalizes EOL. |
| UI/source checks still requiring further migration | `background-playback-service`, `custom-sound-editor-lazy-mount`, `icon-control-accessibility`, `local-sample-bpm`, `polygon-control-style`, `quick-start-accessibility`, `stage-mode-display-stability`, `stage-mode-overlay-wrapper`, `stage-mode-shared-settings`, `task-734-accessibility` | Not proof of correct rendered behavior. Migrate by focused feature area without deleting existing protection. |

Names above omit `.test.ts`. `task-735` no longer reads implementation source;
its translation data check is retained. `source-contract-portability` reads
temporary fixtures, not application implementation.

## Notebook timeout diagnosis

Do not increase the existing 100-second file timeout without evidence.
The previous entry helper slept 400/350 ms and clicked fan coordinates; it now
waits for the real dial, selects the accessible Menu value, waits for closure,
and then waits for the notebook drawing surface. These phases appear as named
steps in failures. Screenshots/traces are retained by the browser runner.

This fixes identifiable animation/coordinate dependence; it does not prove the
cause of a historical Windows timeout. A Windows failure still needs its run,
trace and failing phase to distinguish startup, locale, gesture and audio waits.
The new browser checks also exposed missing web slider values that the old
source test had accepted; explicit web ARIA values now carry the actual state.

## Saved files and change summaries

Historical root PNGs are preserved byte for byte under
`docs/reference-screenshots/`; future captures go to ignored output directories.
Do not delete user references or rewrite saved history just to make it cleaner.
For future human-written commits, summarize the behavior/contract changed and
its purpose. Memory-only summaries should not stand in for product changes.
This does not rename past platform-generated commits.
