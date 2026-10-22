# 드럼 루디먼트 구현 가능성 검토

## 검토 범위

공개 레퍼런스와 현재 데이터·렌더링·재생 코드를 대조하고, 기존 단위 테스트와 작은 실행 예제로 제한을 확인했다.
PAS 40개 전체를 앱에 입력하거나 실제 기기에서 연주·청취한 검증은 아니다. 앱 기능 코드는 변경하지 않았다.

## 레퍼런스

- PAS 공식 40 International Drum Rudiments: https://pas.org/rudiments/
- PAS 공식 악보 PDF: https://pas.org/wp-content/uploads/2024/04/pas-rudiments.pdf
- Vic Firth Hybrid Rudiment Project: https://ae.vicfirth.com/education/hybrid-rudiments/
- Herta: https://ae.vicfirth.com/education/hybrid-rudiments/hybrid-rudiments-herta/
- Cheese: https://ae.vicfirth.com/education/hybrid-rudiments/hybrid-rudiments-cheese/
- Book Report: https://ae.vicfirth.com/education/hybrid-rudiments/hybrid-rudiments-book-report/
- Blue Cheese: https://ae.vicfirth.com/education/hybrid-rudiments/hybrid-rudiments-blue-cheese/
- 보조 해설: https://www.benjaminwaterson.com/blog/drum-rudiments-reviewed-hybrid-edition/

PAS는 40개를 roll, diddle, flam, drag 계열로 분류한다. Vic Firth는 하이브리드의 완결된 공식 목록이나 일치된 명칭이 존재하지 않는다고 설명한다. 따라서 이름별 프리셋만으로 일반 지원을 대체하면 안 된다.
Herta와 Cheese는 공식 페이지의 악보를 스크린샷으로 직접 확인했다. 다른 페이지의 텍스트·링크 확인을 영상 청취나 악보 전체의 시각 검증으로 간주하지 않는다.

## 구조별 대조

| 사례 | 필요한 구조 | 현재 상태와 검토 결론 |
| --- | --- | --- |
| Single stroke | 순차 타격, 손순서 | 기본 순차 리듬은 표현 가능. 전용 손순서 구조는 별도 설계 필요 |
| Paradiddle / double stroke | 같은 리듬에서 다른 R/L 배열 | 시간만으로 손순서 추론 불가. 손 식별 입력 또는 수동 지정 필요 |
| Herta | 짧은 두 음과 긴 두 음, 혼합 음가 | 일반 음가 조합은 가능. 혼합 음가의 연음 버전에서 요소 개수 기반 비율이 문제 |
| Five/seven stroke roll | 축약 diddle와 실제 세부 타격의 대응 | 축약 표기와 펼친 재생을 분리하는 구조 필요 |
| Flam | 주음과 연결된 앞꾸밈 타격 | 현재 grace_note는 기호 표시이며 독립 꾸밈 타격 정보가 없음 |
| Drag / ratamacue | 복수 앞꾸밈 타격, 손순서, 리듬 | 단일 꾸밈 기호만으로 충족 불가 |
| Swiss Army Triplet | 연음, 플램, 손순서 | 각 속성을 함께 저장하고 재생하는 구조 필요 |
| Cheese | 플램과 더블 스트로크의 결합 | 서로 배타적인 장식 이름 하나가 아니라 조합 가능한 의미 구조 필요 |
| Book Report / Blue Cheese | 복합 하이브리드 | 위 기초 구조의 조합으로 설계 가능. 완성 구현·실기 검증은 아님 |
| Multiple bounce / buzz roll | 지속되는 롤과 반복 바운스의 구별 | 고정 개수 음표·고정 64분음표만으로 대체하면 의미 손실 |

## 실행 확인

실행 명령:

`npx tsx --require ./tests/_stubs/setup.cjs --test tests/score-tuplet.test.ts tests/score-playback.test.ts`

결과: 73개 통과, 실패 0개. 이는 기존 기능의 테스트이지 루디먼트 전체 지원 증명이 아니다.

추가로 현재 함수에 메모리상 데이터를 넣은 실행 확인:

1. 16분·16분·8분·8분을 3:2로 압축한 Herta형 리듬은 4분음표 1박이어야 한다. 현재 생성 함수는 실제 요소 4개를 기준으로 4:2로 바꿔 0.75박으로 계산한다. 혼합 음가 연음의 비율은 요소 수가 아니라 기준 음가와 시간 범위로 정의해야 한다.
2. 4분음표에 grace_note를 붙여도 재생 타임라인은 주음 이벤트 하나다.
3. 같은 음에 tremolo를 붙여도 재생 타임라인은 이벤트 하나다.
4. 현재 음가 타입에는 64분음표가 없다. 지원하지 않는 문자열을 타입 검사 없이 강제로 넣으면 길이 변환 함수의 기본값인 1박이 반환된다. 이 강제 입력은 정상 지원 경로가 아니다.
5. percussion clef 파트는 현재 타임라인 병합에서 제외되므로 정상 드럼 파트 재생도 별도로 정비해야 한다. drumType 필드 존재만으로 타악기 파트 재생 지원이라고 판단하지 않는다.

## 입력·판정 설계에 주는 영향

- 원래 입력, 음악적 해석, 화면 축약 표기, 실제 재생 타격을 분리한다.
- 앞꾸밈 타격은 기계적으로 64분음표에 붙이지 않는다. 정량 음가와 비정량 꾸밈음은 다르다.
- 플램과 두 개의 정량 타격은 한 마디 문맥을 보더라도 의도 구분이 애매할 수 있다. 후보와 직접 지정이 필요하다.
- 한 패드의 시간 기록만으로 좌우 손·강세·바운스 기법을 확정하지 않는다. 터치 압력 지원을 모든 기기에 가정하지 않는다.
- 현재 합의된 연습 점수 비중은 유지하되, 꾸밈 타격과 롤을 어떤 단위로 판정할지 추가 설계가 필요하다. 플램 앞꾸밈을 단순 추가 타격으로 감점하면 안 된다.
- 최대 한 마디의 자동 해석 문맥과 이미 지정된 마디 간 연음의 지속 상태는 구분해야 한다. 자동 인식 범위를 임의로 늘리지 않는다.

## 결론

일반 음가, 기준 단위가 있는 연음, 주음에 연결된 꾸밈 타격, 축약 롤, 손순서, 강세를 조합하는 구조로 복잡한 루디먼트의 표현·편집·재생은 구현 가능한 방향이다.
현재 코드에 음가와 기호만 추가해서 완성되는 수준은 아니다. 모든 하이브리드의 이름·손순서·기법을 단일 패드 입력에서 자동 복원할 수 있다고 보장하지 않는다.
다음 검증은 위 사례의 기대 타격 시점·표기·손순서를 고정한 뒤 저장/복원, 렌더링, 재생 이벤트, 입력 해석, 연습 판정을 각각 비교하는 방식이어야 한다.
