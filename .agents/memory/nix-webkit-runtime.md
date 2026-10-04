---
name: Nix WebKit runtime
description: Distinguish Playwright Linux/Nix setup failures from app regressions.
---

Treat WebKit runtime setup failures separately from browser compatibility failures. Linux WebKit tests do not establish iOS/macOS Safari or physical audio latency.

**Why:** Playwright's Linux MiniBrowser wrapper can overwrite inherited library paths; its host checker uses ldconfig for some libraries and can miss Nix-provided ones. Nix GStreamer soup plugins can load libsoup2 into a WebKit process already using libsoup3, crashing before the app loads. Selecting arbitrary store paths can accidentally select a 32-bit library.

**How to apply:** Prefer the official Ubuntu browser/dependency installation in CI. In Nix, verify architecture and required ABI, preserve runtime paths only for browser children, and avoid mixing soup2/soup3 plugins while retaining real core/audio decoding plugins. Do not disable app assertions to work around these environment failures.