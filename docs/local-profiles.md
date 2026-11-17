# Local profiles and storage ownership

Profiles are local only. No account, backend persistence or synchronization is
introduced. The app's existing public website constant remains the URL source.

## Storage inventory

All application content consumers use `lib/profile-storage.ts`, rather than the
raw device store. The following logical keys live under `local_profile:<id>:`:

| Content | Logical keys |
| --- | --- |
| Shared and per-mode preferences, identity, instrument, trainer | `metronome_settings` (includes `modeSettings`, tempo trainer, photo and edited room overrides) |
| Practice book and quick add | `practice_book`, `metronome_quick_add_v1` |
| Activity, room visits, logging preference, goals | `metronome_activity_log`, `metronome_activity_settings`, `metronome_goals` |
| Rooms and lab unlock | `metronome_practice_rooms`, `metronome_lab_unlocked` |
| Scores and legacy Stage settings | `metronome_scores_v1`, `metronome_score_<id>`, `stage_settings_v1` |
| Stage set list | `stage_setlist_v1` |
| Staff notebooks and their embedded practice sources | `lab_staff_notebooks_v1` |
| Legacy rhythm documents, recovery, input preference | `rhythm_lab_documents_v1`, `rhythm_lab_recovery_v1`, `rhythm_lab_entry_mode_v1` |
| Samples | `@note_samples`, `@note_sample_names`, `@note_sample_sources`, `@note_sample_channels`, `@note_sample_volumes`, `@note_sample_speeds`, `@note_sample_metro_channels_beat` |
| Custom sounds and drum pad assignments | `metronome_custom_sound_sets`, `@drum_kit_mapping_v1` |
| Fade-out and control pad | `metronome_fade_out`, `metronome_control_pad_mapping_v1` |
| Global and per-mode keyboard bindings | `metronome_keyboard_bindings_v1`, `metronome_keyboard_bindings_by_mode_v1` |
| Appearance and language | `metronome_theme_color`, `metronome_theme_mode`, `metronome_custom_hex`, `metronome_hub_images`, `metronome_landscape_image`, `metronome_language` |
| Onboarding, tutorials and hints | `metronome_onboarding_done`, `metronome_onboarding_lang_done`, `metronome_tutorial_state_v1`, `hint_shown_v1_*` |
| Other preferences | `metronome_dial_wall_v2`, `@practice_book_view_mode`, `metronome_voice_assistant_v1`, `metronome_custom_tuning_sets_v1`, `metronome_signal_sensitivity_v1` |

Device-global data is limited to the profile registry, interrupted-reset journal,
the old restore-recovery snapshot and retained migration originals. OS permission
grants are device-managed; this change does not request background location.
Raw storage reads in the speech-file collector and derived-sample cache are
intentional: deletion must consider references in **every** profile and the
retained migration originals, not just the current profile.

## Migration

Startup completes old backup recovery before opening profiles. The initial copy
is verified byte-for-byte before publishing the registry. Raw originals are
retained, not removed. An interrupted unpublished copy can be repeated safely.
Failure blocks startup with retry rather than starting an empty writable session.
Reset explicitly includes the retained originals; its durable journal finishes
an interrupted reset before migration can run again.

## Runtime handoff

A JS runtime binds its storage adapter exactly once. A profile switch stops
scheduled/playback work, completes GPS tracking, flushes debounced settings and
all sample-map writers, waits for activity writes and direct storage writes,
invalidates settings loads and releases sample/PCM resources. Failed saves block
the handoff. The session is then sealed and the selected registry ID is committed
before reloading the runtime. Reloading resets module caches, retry state,
permission-recovery closures, query state, timers and component state.

Old callbacks can only address their original namespace. Once sealed, new writes
from them reject rather than redirecting to another profile. Web tabs retain
their own runtime binding; the registry is the default for the *next* launch,
not a mutable target used by every tab's callbacks. Web Locks serialize registry
changes across tabs; an in-process queue provides the native equivalent.

## Backups

Export reads the requested namespace without activating it. The active namespace
is flushed first when it is the export target. The backup includes the inventory
above and referenced audio/images, including profile photos, custom sounds,
drum sources, score reference images and notebook sources.

Import validates the envelope, schema version, JSON structure, scores, notebooks
and rhythm recovery before restoring files. It uses new media filenames and a
fresh profile ID, verifies staged key/value writes, and publishes the registry
last. Existing namespaces are never cleared or overwritten. Duplicate names and
document IDs are therefore safe. Interrupted unpublished namespaces/files are
not user-visible; recovery never deletes a different profile's assets.
Old full backups use the same schema migration entry point and become one new
profile. Files absent from an old backup cannot be recreated from their URI alone.

## Verification

- `npm run typecheck`
- `npm run lint` (no errors; the repository has existing warnings)
- `npm test -- --runInBand`
- `e2e/profiles.spec.ts`: creation, editing, photo removal, photo-inclusive
  backup/restore, inactive-profile export, switching, overlapping cross-tab
  import/switch, Korean/English and 360×640 / 667×375 / 1024×768 layouts.
- Unit integration tests exercise real namespacing with the raw device-store
  fake, interrupted migration, partial imports, duplicate IDs, sealed late
  writes, save-failure switch blocking and legacy recovery.

Browser verification is not a claim of iOS/Android hardware verification.
Installed-app reloads, photo-library cancellation, native filesystem persistence
and foreground GPS completion still require device testing. No native build,
publication or GitHub workflow change was performed.
