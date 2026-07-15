---
name: Alert.alert is a no-op on React Native Web
description: Explains why Alert.alert-based menus/dialogs never appear when testing this app in a browser, even though the code is correct.
---

`node_modules/react-native-web/.../exports/Alert/index.js` defines `Alert.alert()` as an empty stub (`static alert() {}`). It does not render any dialog, confirm, or menu on web.

**Why:** react-native-web intentionally does not implement `Alert.alert` (no good web equivalent for multi-button native alerts). Any code path relying on `Alert.alert(...)` for confirmation menus (e.g. long-press context menus with delete/link/cancel options) is invisible on web — it works correctly on iOS/Android but is fundamentally untestable through a Playwright/browser e2e run.

**How to apply:** When an e2e web test reports that a long-press or other action "should open a menu but nothing appears," first check whether the menu is implemented via `Alert.alert`. If so, this is expected web behavior, not a regression — verify the underlying handler logic and trust native testing/manual QA for the actual UI, rather than chasing a web-only repro. Consider `lib/confirm.ts` (`confirmDestructive`) for flows that need to work cross-platform including web.
