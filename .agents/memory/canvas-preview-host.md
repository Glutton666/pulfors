---
name: Canvas preview host after workflow recovery
description: Verify the selected frame's current proxy wrapper, not a previously used Expo hostname.
---

Verify canvas rendering through the selected frame's current wrapper URL after restarting Expo.

**Why:** A previously working Expo-prefixed development hostname stopped responding while the same-origin workspace wrapper successfully served the app. Testing that old hostname incorrectly suggested that recovery had failed.

**How to apply:** Read the current frame URL and verify its embedded app. A successful canvas URL update alone does not prove that the frontend workflow or its embedded screen is healthy.
