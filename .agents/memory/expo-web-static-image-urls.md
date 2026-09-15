---
name: Expo web static image URLs
description: How to resolve bundled image assets for Expo web CSS masks and direct image sources.
---

React Native Web does not expose `Image.resolveAssetSource` as a callable API in this project. For bundled assets that must be referenced by CSS, resolve the module through `expo-asset`; when its URI is empty in Metro dev mode, build the `/assets?unstable_path=...` URL from the asset metadata.

**Why:** Calling the native image resolver during module initialization crashes the entire web app before the preparation screen can render. Expo's web image component also needs a usable URI when the same asset is used as a CSS mask.

**How to apply:** Keep native rendering on the bundled module source, but use the resolved web URI for web `expo-image` sources and `mask-image`/`-webkit-mask-image` styles. Guard the web mask until a valid URI exists.