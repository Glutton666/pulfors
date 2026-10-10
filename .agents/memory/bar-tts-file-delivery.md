---
name: Bar TTS file delivery
description: User-confirmed file-based TTS, rather than synthesis during each bar playback.
---

바 모드 TTS는 글로 음성 파일을 생성해 해당 마디의 기존 샘플처럼 저장·재생하는 방식이다. 마디가 재생될 때마다 실시간으로 TTS를 호출하는 방식으로 바꾸지 않는다.

**Why:** 사용자는 글을 음성 파일로 만들어 마디에 넣는 방식을 선택했다.

**How to apply:** TTS 생성과 저장된 파일의 재생을 분리한다. 이후 재생·반복·미리듣기가 새 음성 생성 요청을 필요로 하지 않도록 하고, 생성한 음원은 기존 파일 편집·보관 흐름에 연결한다.
