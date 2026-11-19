---
name: Polygon mode polyrhythm semantics
description: Product semantics decided for the polygon metronome — polyrhythm, mute, and mid-measure change behavior.
---

The polygon metronome is a **polyrhythm** feature: an N-sided layer must sound N evenly-spaced pulses per measure (N-tuplets at the set BPM), never once per engine beat.

**Why:** The user explicitly rejected per-engine-beat firing — "just overlapping same-interval metronomes." 3-sided + 4-sided must sound as 3:4.

**Scheduling rule (settled after an overlap bug):** keep the engine beat callback as the logical measure/phase authority and read its mutable inputs via refs, never React state. On Web Audio, schedule a measure's sources against a persistent `AudioContext` anchor (not `Date.now()` or per-slot JS timers); advance later measures from that anchor and only re-anchor after a clearly late callback. Native players lack future-start scheduling, so preserve their engine-beat-driven pooled playback path.

**Why:** Browser main-thread timing can jitter while AudioContext preserves scheduled source timing. A fresh `currentTime` anchor each measure reintroduces audible drift; clearing all sources at a nominal boundary can also cut a valid late-offset source.

**How to apply:** Explicit BPM, meter, stop, disable, and edited/deleted-layer changes cancel obsolete future sources and rebuild at the next safe engine beat. Normal measure transitions do not cancel prior sources; remove their handles when playback ends.

**Decided semantics:**
- Mute vertex = silent AND visually off at its slot time, but the slot keeps its time — the period never shrinks.
- BPM / time-signature changes clear already-scheduled slots; the next engine beat schedules using the latest timing. Do not expect remaining slots in the current beat window to be rescheduled.
- A time-signature change resets the engine's beat counter to 0, so the polygon's measure phase must be re-anchored too, or measure starts drift apart.
- Layer edits during playback silence the rest of the current measure and apply from the next measure (prevents stale-closure fires on deleted vertices).

꼭짓점 타이밍은 앞당김과 늦춤을 모두 지원한다. 화면과 상세창은 ms를 쓰되 레이어 간격에 대한 비율을 보존한다. 잡은 채 좌우로 두세 번 흔들어야 드래그 조절이 열리고, 가만히 길게 누르면 상세창을 연다.

**Why:** 사용자가 선택·상세 설정·타이밍 드래그를 구분하고, 앞당기기와 늦추기를 모두 지원하도록 지정했다. 기존 스윙의 상대적 간격도 배속 변경 시 유지해야 한다.

**How to apply:** 앞당긴 첫 꼭짓점은 다음 마디의 이벤트 소유권을 유지하면서 이전 마디 안에서 예약한다. 재생 시작에만 이전 마디가 없으므로 첫 점을 시작에 맞춘다. 편집 시 예약은 취소하되 이미 울린 이벤트를 지우지 않아 같은 점이 반복 재생되지 않게 한다. 흔드는 구간은 타이밍 값에 포함하지 않는다.
