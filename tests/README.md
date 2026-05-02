# 테스트

순수 로직 단위 테스트 (Node.js 내장 `node:test` + `tsx` 런타임 사용).
React Native 컴포넌트는 테스트하지 않습니다 (런타임이 다름) — pure module만 다룹니다.

## 실행

```bash
# 전체 테스트
npx tsx --test tests/*.test.ts

# 단일 테스트
npx tsx --test tests/i18n.test.ts
```

## 현재 커버리지

- `tests/i18n.test.ts` — 번역 키 양 언어 존재 검증 + 헬퍼 함수
- `tests/metronome-engine.test.ts` — 엔진 생성/BPM clamp/박자 설정
- `tests/storage-notifier.test.ts` — 저장 실패 이벤트 버스

## 테스트 추가 가이드

순수 모듈 (lib/*.ts 중 React Native 의존성 없는 파일) 우선.
React Native 모듈을 import 하는 경우 `tests/_stubs/` 에 stub을 추가하고
`Module._resolveFilename` 패치 (metronome-engine.test.ts 패턴 참조).
