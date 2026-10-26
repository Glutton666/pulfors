---
name: Rhythm viewport benchmark clocks
description: Independent display clocks must follow synthetic capture time when measuring a virtualized recording staff.
---

긴 녹음의 구간 렌더링을 비교할 때 입력 시각뿐 아니라 독립적인 표시 시계도 같은 녹음 위치로 맞춘다. 반영 검사는 전체 음표 개수 증가가 아니라 새 입력의 실제 화면 표시를 확인한다.

**Why:** 입력용 시각만 긴 기록의 끝으로 이동하고 표시 ticker를 멈추면, 실제로는 정상적인 화면 구간 제한이 새 음표를 표시하지 않는 오류처럼 보인다. 전체 음표를 그리던 테스트에서는 이 시계 불일치가 드러나지 않았다.

**How to apply:** 입력→화면 성능 하네스에서 각 독립 시계의 진행을 명시하고 측정 구간에 ticker 처리·대기 시간이 포함되는지 기록한다. 가상화 변경 전후는 같은 하네스로 비교하며 전체 노드 수가 증가해야 한다는 가정을 두지 않는다.
