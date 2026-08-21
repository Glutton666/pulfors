---
name: React Native Web radio state
description: React Native Web radio Pressables need an explicit ARIA checked value for browser accessibility and Playwright assertions.
---

For a selectable `Pressable` rendered as a radio option on the web, pass the selected state through the direct `aria-checked` prop alongside `accessibilityRole="radio"`.

**Why:** In the project's React Native Web setup, `accessibilityState` did not render an `aria-checked` attribute on the browser element. Icon markup also varies by renderer, so relying on an SVG checkmark made browser tests fragile.

**How to apply:** When a web E2E test needs to confirm one option is selected, assert its `aria-checked` value rather than a descendant icon tag. Keep the direct ARIA prop in sync with the source of truth used to render the visual selection.