---
name: Alert.alert is a no-op on React Native Web
description: Explains why native Alert-based workflows need web alternatives, not just native handler tests.
---

`node_modules/react-native-web/.../exports/Alert/index.js` defines `Alert.alert()` as an empty stub (`static alert() {}`). It does not render any dialog, confirm, or menu on web.

**Why:** react-native-web intentionally does not implement `Alert.alert`. Native handlers can pass tests while their web confirmation/menu never appears and its callbacks are unreachable. Since the user expects web/app feature parity, this is a real missing web workflow, not merely a browser-testing limitation.

**How to apply:** When a web action does nothing, check whether it depends on `Alert.alert`. Verify native handler logic separately, but do not count that as web functionality. Use a web-capable confirmation for simple decisions and an actual cross-platform menu for multi-action dialogs; verify that browser users can reach the callbacks.

Cross-platform dialogs must remain nonblocking. Put dependent actions (especially reload after successful restore) in the confirmation button callback, not immediately after an informational alert.

**Why:** Browser alert/confirm previously blocked execution. An app-rendered dialog does not; immediate reload hides the result before the user can acknowledge it. Browser tests must also acknowledge export-complete dialogs before trying to open restore.

**How to apply:** Keep browser menu/confirmation flows inside the app rather than relying on iframe browser-modal permissions. Preserve native delegation, and explicitly wait for each dialog's dismissal in integration tests.
