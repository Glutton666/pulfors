---
name: Backup image asset identity
description: Rules for safely identifying and validating embedded photo assets in backup and share files.
---

Use a bounded, deterministic key derived from the complete source URI for each embedded image, and determine the stored format from validated decoded bytes rather than the URI filename.

**Why:** Different local photos can share a filename, while browser blob URLs and data URIs may have no usable extension. Filename-keyed archives can overwrite photos or silently omit valid browser images.

**How to apply:** Any backup/share path that embeds local images should preserve URI-level identity, enforce count and byte limits, and validate both complete Base64 syntax and format-specific start/end structure before writing restored files.