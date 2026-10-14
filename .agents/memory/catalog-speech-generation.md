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

Eleven Multilingual v2 supports Korean but does not support the API's
`language_code` enforcement parameter. Korean voice labels and a successful
request do not establish native pronunciation, especially for isolated words.

**Why:** The user rejected the replacement's pronunciation after comparing
the actual recordings. Changing to different Korean-labeled speakers on the
same model was insufficient. The provider's convert documentation explicitly
excludes multilingual v2 from language enforcement.

**How to apply:** When Korean count pronunciation is rejected, distinguish
language support from forced-language synthesis and acoustic quality. Try a
genuinely different language-enforced path with a small 넷/오 listening sample
before rebuilding the full catalog. Preserve approved takes when expanding
that batch rather than regenerating them.

Forced Korean language tokens are not proof of a native Korean accent.

**Why:** The user also rejected the Supertonic 2 M1/F1 Korean-enforced
넷/오 originals. Both changing Korean-labeled catalog speakers and changing
to a language-enforced engine failed the actual listening gate.

**How to apply:** Do not reuse those candidates as approved voices. Clarify
whether the remaining defect is word identity, foreign accent, or elongated
delivery before another synthesis attempt; distinguish an engine's supported
language from its stock speakers' actual Korean pronunciation.
