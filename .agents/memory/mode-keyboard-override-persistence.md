---
name: Mode keyboard override persistence
description: How per-mode keyboard settings should inherit later global binding changes.
---

Persist only bindings that differ from the current global bindings in each mode's override record. Never save a complete resolved binding map as a mode override.

**Why:** A resolved map contains inherited global values. Saving the whole map turns those inherited values into accidental overrides, so later global rebinding changes stop reaching that mode.

**How to apply:** When saving beat, bar, note, or stage keyboard settings, filter to that mode's actions and persist only values that differ from the global binding map. Loading should merge global bindings first, then the sparse mode overrides.

오선노트 키는 통합 메트로놈 키를 상속하지 않는다. 같은 프로필 안에서도 오선노트의 기본 키에 대한 변경만 따로 저장한다.

**Why:** 오선노트의 문자·방향키는 기보용이다. 다른 모드의 같은 키를 바꿔도 기보 단축키가 바뀌거나 키 충돌로 처리되면 안 된다.

**How to apply:** 오선노트가 보이면 메트로놈 단축키를 먼저 차단하고, 텍스트 편집·Tab·포커스된 버튼은 브라우저 또는 열린 도구에 맡긴다. React Native Web의 대화상자는 Escape를 키를 놓을 때도 처리하므로, 위쪽 팝업을 먼저 닫았다면 같은 키가 아래 대화상자까지 닫지 않는지 검증한다.