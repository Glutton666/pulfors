---
name: Native strong symbol verification
description: Shared S markers must not rely on font masks; browser checks do not establish native release visibility.
---

Strong S markers are shared by Beat and Bar. Preserve a font-independent vector rendering path rather than reintroducing text masking.

**Why:** The user reported missing markers in both modes in the installed app while the web preview displayed them. Earlier rendering used different web/native paths, so browser-only checks could miss the native issue. The exact installed binary and device failure were not available to reproduce.

**How to apply:** Test the actual shared marker instead of replacing it with a letter stub. Small sizes and contrast updates need coverage. Such tests and web screenshots still cannot establish visibility in a native release; disclose that limit and distinguish preview refreshes from updating the installed binary.

The user also pointed out that the S stayed fixed while its surrounding marker changed size.

**Why:** Strong symbols must remain proportional to their beat circle or subdivision cell, not remain a fixed caption-sized glyph.

**How to apply:** Verify the rendered symbol scales with its container across responsive sizes, rather than only checking that an S exists.
