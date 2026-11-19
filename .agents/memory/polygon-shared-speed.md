---
name: Polygon shared speed semantics
description: User-defined fraction labels and how they differ from conventional note-value interpretation.
---

폴리곤의 공통 배속은 **1/2 = ×2, 1/4 = ×1, 1/8 = ×0.5**이며 전체 레이어에 함께 적용한다. 표시 BPM은 배속을 고를 때 바뀌지 않는다.

**Why:** 사용자가 이 대응과 전체 레이어 동시 적용을 직접 지정했다. 일반적인 음가 길이 해석을 적용해 분수와 배속의 대응을 뒤집으면 요구와 달라진다.

**How to apply:** 이후 폴리곤 컨트롤·타이밍을 수정할 때 이 대응을 유지하고, 다른 모드의 박자 분모 설정과 혼동하지 않는다.

공통 속도는 별도 버튼을 두지 않고 기존 BPM 조작부의 숫자 중앙을 길게 눌러 순환한다.

**Why:** 사용자가 “공통속도 길게 눌러서 변경이 따로 빼라는 게 아니라 BPM 쪽을 길게 눌러서 바꾸는 기존 방식을 대입”하는 것이라고 정정했다.

**How to apply:** BPM 중앙의 기존 길게 누르기를 활용해 한 단계씩 바꾸고, 짧게 누르기와 좌우 드래그의 기존 BPM 동작은 유지한다.
