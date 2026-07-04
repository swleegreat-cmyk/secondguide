# 2027 수시 상담 프로그램 (병점고 3학년 4반, 34명)

산출물은 **오프라인 단일 HTML 1개** — `susi-counseling-2027.html` (약 4.9MB, 바닐라 JS).
교사가 브라우저로 파일을 직접 열어 사용한다. 서버·외부 요청 없음.

## 절대 규칙

1. **`tools/golden_cases.json` 기대값 수정 금지.** 골든 케이스는 대학별 환산 검증의 기준선이다.
   검산 불일치 시 고칠 것은 엔진 코드이지 기대값이 아니다. (PreToolUse 훅이 Edit/Write를 차단한다.)
2. **학생 데이터 외부 전송 금지.** 학생 데이터는 브라우저 내에서만 처리되며 외부로 전송되지 않는다.
   fetch/XHR/외부 CDN/폼 전송을 추가하지 않는다 — 오프라인 단일 HTML 원칙.
3. **등급 스케일은 낮을수록 좋다 (1등급 > 9등급).** 비교·정렬·부등호 방향을 항상 재확인할 것.
   `classifyBand`는 학생 평균이 컷보다 **작을수록** 유리하게 판정한다.
4. **판정 표시는 4구간(안정/적정/소신/상향)이 1차 결과**이고, 기여도(factorBreakdown)는 세부 근거다.
   구간을 건너뛰고 기여도만 보여주지 않는다.
5. **단일 % 점수(예: "합격 확률 73%")를 생성하지 않는다.** 컷 데이터의 한계(특목고 혼재,
   전형별 모집단 차이) 때문에 확률 표현은 오해를 낳는다.
6. **UI 작업 전에 숫자 검증 먼저.** 화면을 만지기 전에 `node tools/verify.mjs && node tools/audit.mjs`가
   전부 PASS인 상태에서 시작한다.

## 데이터 구조

- **지원 카드 = 대학 × 세부전형 × 학과.** adiga.json의 행 1개가 카드 1장이다.
  `DEPT_CUTLINES`는 `"대학명|학과명"` 키 5,602개, 엔트리(=카드) 총 14,265개.
- **adiga.json** (원본 사본: `tools/adiga.json`): 원본 14,332행 → (대학·학과·전형) 중복 67건 제거 → 14,265행.
  - 결측: 등급50 2,038 / 등급70 2,120 / 모집인원 628 / 추합 1,931 / 경쟁률 867(NaN 포함, 결측 처리) (등급 둘 다 결측 2,036).
  - 중복 처리 규칙: 등급50/70 **완전성 높은 레코드 우선** → 모집인원 큰 쪽 → 선착순 (excel_ingest.py).
  - 대학명 정규화: `canon()` — ALIAS 맵(68건, `tools/univ_alias.json`) 우선, 그 외 `~대` → `~대학교`.
    캠퍼스는 별도 키 유지 (예: `중앙대(다빈치)` → `중앙대학교(다빈치)`).
- **빌드 파이프라인** (스크래치패드에서 수행, 산출물만 리포에 커밋):
  `excel_ingest.py` (성적 XLSX + adiga.json → data_*.js, dept_cutlines.json, data_quality.json)
  → `build.py` (template_v2.html의 토큰에 JSON 주입) → `susi-counseling-2027.html`.
  **최종 HTML을 직접 편집하지 말 것** — 템플릿을 고치고 재빌드한다.

## 주요 엔진 함수 (susi-counseling-2027.html 내부)

| 함수 | 역할 |
|---|---|
| `calcWeightedAvg(student)` | 전과목 단위가중 평균등급 (stAvg) — **4구간 판정의 실제 입력** |
| `computeScore(subjects, rule, achMap)` | 대학별 반영교과 환산등급. `NAESIN_RULES`는 100개 대학만 보유 |
| `buildApplicationCards(student)` | 카드 14,265장 생성. `score`(환산)는 규칙 미보유 대학에서 stAvg 폴백 복사 — **표시용이며 판정에 미사용** |
| `classifyBand(stAvg, g50, g70, cw)` | 4구간 판정: stAvg vs 학과·전형 등급50/70 (min/max 정규화) + 충원배수(cw≥1.0) 한 단계 완화 |
| `getCards(student, filters)` | 카드 조회·필터(계열/전형/지역/구간)·정렬 공통 진입점 |
| `calcCompositeScore` / `buildFactorBreakdown` | 종합 점수·기여도 (breakdown 합은 항상 100) |
| `checkMinRequirement(student, minText, dept)` | 수능 최저 충족 판정 (verify.mjs 총 69건 중 최저 판정 케이스가 대부분) |
| `calcOptimalPortfolioCards(student)` | AI 6지원안: 안정2/적정2/도전2 골격, 대학당 최대 2장, 교과·종합 혼합, 최저 리스크 분산 |
| `classCardConflicts()` | 학급 내 같은 (대학·전형·학과) 6지원 경합 맵 |
| `tagSentence` / `tagStudentRecords` | 세특 문장 태깅 (신호 2종=상 / 1종=중 / 0종=하) |
| `analyzeRecord` / `studentTopicThreads` | 생기부 질적 분석 · 주제 스레드(연속성·계열 정합) |

## 검증 절차

- **모든 수정 후**: `node tools/verify.mjs && node tools/audit.mjs` — 전부 PASS + exit 0 확인.
  (Playwright가 최종 HTML을 headless로 열어 실제 함수를 실행한다. 의존성은 `tools/`에서 `npm install`.)
- **숫자(컷·환산·판정)를 만졌다면**: `node tools/student_check.mjs <이름>` 으로 **샘플 3건 이상을
  adiga 원본과 대조 출력**해 일치를 확인하고 결과를 보고에 포함한다.
- 슬래시 커맨드: `/검증`, `/학생점검 <이름>`, `/상담준비 <이름>` (`.claude/commands/`).

## 성적 갱신 절차 (3학년 1학기 확정 등)

- **실행 1줄**: 스크래치패드에서 `python3 refresh_grades.py <새성적JSON>` — 갱신 전후 스냅샷을 자동
  비교해 콘솔 + `grade_update_report.md`로 변화 리포트를 생성한다 (최초 실행 시 원본을
  `students_original.json`으로 백업, 원복은 같은 명령에 백업 파일을 넘기면 된다).
- **스냅샷 자동 보관**: 갱신 실행 시 갱신 전 상태가 스크래치패드 `snapshots/YYYYMMDD/`에 보관된다
  (students.json 성적 원본 · state.json 카드 판정 RLE+4구간 분포+보완 목록 · summary.md 분포 표 —
  보관 항목·용량은 실행 로그로 출력). adiga 데이터 교체 전에는 `python3 refresh_grades.py --snapshot-only`.
- **지난 상담 대비 변화**: build.py가 최신 `snapshots/*/state.json`을 `__PREV_SNAPSHOT__` 토큰으로 주입 →
  브라우저의 `comparePrevSnapshot(student)`가 평균 변화·바구니 카드 구간 변동·보완 항목 해소를 산출한다.
  구간이 바뀐 카드에는 "갱신 후 구간 변동" 플래그(바구니 패널·카드 행), 결과지에는 ⑤블록이 붙는다.
  스냅샷이 없으면 전부 정상 생략(오류 아님). 카드 목록 지문(`cardKeyFingerprint`) 불일치(adiga 교체) 시
  구간 비교만 차단되고 평균·보완 비교는 유지된다.
- **리포트 내용**: 학생별 평균등급 변화(±·악화/개선), 4구간 판정이 바뀐 카드 수,
  6지원안 무효화(기존 조합 카드의 구간 하락·유보 전환) 학생·카드 목록, 안정 0장 긴급 학생.
- **갱신 후 확인 항목**: ① `node tools/verify.mjs && node tools/audit.mjs` 전부 PASS,
  ② `node tools/student_check.mjs <이름>` 샘플 3건 원본 대조, ③ 리포트의 6지원 무효화·긴급
  학생을 상담 우선순위에 반영, ④ 최종 HTML 재배포(다운로드 링크 갱신).

## 알려진 데이터 한계 (수정 아닌 인지 대상)

- 종합전형 등급50/70에는 특목·자사고 합격자 내신이 섞여 있다 (예: 성균관대 과학인재 중앙값 5.2대).
  → **컷 해석주의 처리로 완화됨**: `isCutCaution(대학, 전형, g50)` — CUT_CAUTION_UNIVS(서울15 상위권 14곳)
  × 종합전형 × 50컷>3.0 카드는 안정/적정 대신 "판정 유보(컷 해석주의)"로 표시된다 (교과전형·컷 3.0 이내 유지).
- 카드의 "환산 N" 표기는 NAESIN 규칙 미보유 대학에서 전과목 평균의 복사값이다.
