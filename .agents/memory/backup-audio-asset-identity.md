---
name: Backup audio asset identity
description: How embedded audio files must be keyed and remapped in backups.
---

Use a deterministic source-URI-derived key for each embedded audio asset. Do not use only the URI basename. Keep basename lookup as a restore-only fallback for older backups.

**Why:** Different recordings can legitimately share a filename. Basename-only maps collapse those files, causing multiple sample slots to restore the wrong audio.

**How to apply:** Use the same URI-derived identity when collecting assets and remapping restored sample URIs. Preserve URI fragments such as trim ranges after replacing the base URI.