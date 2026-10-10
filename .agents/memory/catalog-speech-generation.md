---
name: Catalog speech generation
description: Rate limits, output-path behavior, and acoustic validation boundaries for generated speech.
---

Generate small batches of catalog speech, and always consume the returned filePath rather than assuming requested outputPath was overwritten.

**Why:** Large concurrent requests produced rate-limit failures; repeated requests to the same path produced suffixed files instead of replacing the original, even with the default overwrite behavior.

**How to apply:** Keep batches below the provider's request ceiling or await sequentially. Explicitly select the returned source for offline asset builds. Verify all clips exist before referencing them from Metro.

An isolated word can sound longer than the same word in a counting sequence. Silence boundaries require exact expected chunk counts, conservative padding, and human listening.

**Why:** Contextual Korean counting reduced isolated-word length, but English connected speech did not provide a reliable one-chunk-per-number split. Duration measurements cannot certify pronunciation.

**How to apply:** Reject ambiguous segmentation, keep pitch/number/onset identity intact, and distinguish automated audio checks from actual listening in delivery notes.
