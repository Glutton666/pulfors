---
name: Web audio bugs need iframe-embedded repro
description: Reproducing autoplay/audio-context bugs in Replit's preview requires simulating iframe embedding, not a bare top-level page
---

Bare top-level Playwright pages can pass while the real (iframe-embedded) Replit preview fails for autoplay-policy-sensitive audio bugs.

**Why:** Chrome's "requires user gesture" autoplay restrictions and unhandled-`play()`-rejection behavior differ between a page loaded directly and one loaded inside an `<iframe>` (which is how Replit's preview pane actually embeds the app). A pooled/hidden `<audio>` element's rejected `.play()` promise, if not caught, becomes an unhandled promise rejection that can cascade into suspending an app's own shared Web Audio `AudioContext` via the framework's global error-reporting layer.

**How to apply:** When a user reports audio/autoplay bugs that don't reproduce in a normal top-level browser test, wrap the target URL in an `<iframe>` inside the Playwright test page before interacting with it. Also broaden any `HTMLMediaElement.prototype.play` rejection-swallowing patches to match `NotAllowedError` / "can only be initiated by a user gesture", not just pause/load-interruption races — both are benign when the app's real audio path uses a separate Web Audio API context rather than the native `<audio>` element.
