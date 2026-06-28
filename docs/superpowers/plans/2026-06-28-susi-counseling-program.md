# 수시 입시 상담 통합 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 성적(내신·모의고사 등급)을 합격선과 비교해 합격 가능성을 진단하고, 수시 6장 전략과 상담 기록을 관리하는 단일 페이지 웹 도구를 만든다.

**Architecture:** 순수 로직(진단/균형/직렬화/합격선DB)을 의존성 없는 `susi-logic.js`로 분리해 Node로 TDD하고, `susi-counseling.html`이 이를 `<script src>`로 불러와 UI를 렌더한다. 상태는 `state` 한 곳에서 관리하고 변경 시 localStorage 저장 후 재렌더하는 단방향 흐름.

**Tech Stack:** Vanilla JS (ES2020), HTML/CSS, localStorage. 빌드/프레임워크/외부 런타임 의존성 없음. 테스트는 Node 내장 `assert`만 사용.

## Global Constraints

- 모든 등급은 1.0~9.0 숫자, **낮을수록 우수**.
- 합격선·모의고사 모두 **등급**으로 관리.
- 진단 임계값 상수 `THRESHOLD = 0.3` (코드 상단에서 조정 가능).
- 진단 비교 기준 등급은 기본 **내신 주요과목 평균**.
- 외부 라이브러리 금지(테스트 포함). 폰트 Google Fonts만 허용.
- `file://`로 더블클릭해 열어도 동작해야 함(서버 불필요). → 데이터 로드에 `fetch` 금지, `<script src>`만 사용.
- localStorage 키 네임스페이스: `susi.students`, `susi.currentStudentId`.
- UI 문구는 한국어.

---

## File Structure

- `susi-logic.js` — 순수 로직 + 합격선DB. 브라우저에선 `window.SusiLogic`, Node에선 `module.exports`로 노출(UMD 패턴). 단일 책임: 데이터 정의 + 계산.
- `susi-counseling.html` — UI 셸, CSS(디자인 토큰은 `index.html`에서 재사용), 렌더/이벤트/상태. 로직은 `susi-logic.js`에 위임.
- `tests/susi-logic.test.mjs` — Node 테스트(내장 `assert` + 자체 러너). `susi-logic.js`만 검증.

---

## Task 1: 로직 모듈 골격 + 진단 분류 `classify`

**Files:**
- Create: `susi-logic.js`
- Test: `tests/susi-logic.test.mjs`

**Interfaces:**
- Produces:
  - `SusiLogic.THRESHOLD: number` (= 0.3)
  - `SusiLogic.classify(studentGrade: number, cutoffGrade: number) => "안정"|"적정"|"상향"`
  - UMD: Node에서 `const SusiLogic = require('../susi-logic.js')`, 브라우저에서 `window.SusiLogic`.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/susi-logic.test.mjs`

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SusiLogic = require('../susi-logic.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  PASS', name); }
  catch (e) { fail++; console.log('  FAIL', name, '\n    ', e.message); }
}

test('THRESHOLD is 0.3', () => {
  assert.equal(SusiLogic.THRESHOLD, 0.3);
});

test('classify: 학생이 합격선보다 0.3 이상 우수 → 안정', () => {
  assert.equal(SusiLogic.classify(2.0, 2.3), '안정'); // diff -0.3
  assert.equal(SusiLogic.classify(1.5, 2.3), '안정');
});

test('classify: 합격선 ±0.3 이내 → 적정', () => {
  assert.equal(SusiLogic.classify(2.3, 2.3), '적정');
  assert.equal(SusiLogic.classify(2.5, 2.3), '적정'); // diff +0.2
});

test('classify: 학생이 합격선보다 0.3 초과 부족 → 상향', () => {
  assert.equal(SusiLogic.classify(2.7, 2.3), '상향'); // diff +0.4
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: FAIL — `Cannot find module '../susi-logic.js'`

- [ ] **Step 3: 최소 구현** — `susi-logic.js`

```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SusiLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const THRESHOLD = 0.3;

  // 등급은 낮을수록 우수. diff = 학생 - 합격선.
  function classify(studentGrade, cutoffGrade) {
    const diff = studentGrade - cutoffGrade;
    if (diff <= -THRESHOLD) return '안정';
    if (diff <= THRESHOLD) return '적정';
    return '상향';
  }

  return { THRESHOLD, classify };
});
```

- [ ] **Step 4: 통과 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: PASS (4 passed, 0 failed)

- [ ] **Step 5: 커밋**

```bash
git add susi-logic.js tests/susi-logic.test.mjs
git commit -m "feat: add susi-logic module with classify diagnosis"
```

---

## Task 2: 수시 6장 균형 집계 `balanceSummary`

**Files:**
- Modify: `susi-logic.js`
- Test: `tests/susi-logic.test.mjs`

**Interfaces:**
- Consumes: `classify`
- Produces:
  - `SusiLogic.balanceSummary(slots: Array<{분류?: string}>) => { 상향: number, 적정: number, 안정: number, 배정: number, 빈슬롯: number }`
  - 권장 기준 상수 `SusiLogic.RECOMMENDED = { 상향: 2, 적정: 2, 안정: 2 }`

- [ ] **Step 1: 실패 테스트 추가** (Task 1 러너의 `console.log('\n...')` 줄 앞에 삽입)

```js
test('RECOMMENDED is 2/2/2', () => {
  assert.deepEqual(SusiLogic.RECOMMENDED, { 상향: 2, 적정: 2, 안정: 2 });
});

test('balanceSummary: 분류별 개수와 빈슬롯 집계', () => {
  const slots = [
    { 분류: '상향' }, { 분류: '상향' },
    { 분류: '적정' }, { 분류: '안정' },
    {}, { 분류: '' },
  ];
  assert.deepEqual(SusiLogic.balanceSummary(slots), {
    상향: 2, 적정: 1, 안정: 1, 배정: 4, 빈슬롯: 2,
  });
});

test('balanceSummary: 빈 배열', () => {
  assert.deepEqual(SusiLogic.balanceSummary([]), {
    상향: 0, 적정: 0, 안정: 0, 배정: 0, 빈슬롯: 0,
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: FAIL — `SusiLogic.balanceSummary is not a function`

- [ ] **Step 3: 구현** — `susi-logic.js`의 `return` 직전에 추가하고 `return` 객체에 등록

```js
  const RECOMMENDED = { 상향: 2, 적정: 2, 안정: 2 };

  function balanceSummary(slots) {
    const out = { 상향: 0, 적정: 0, 안정: 0, 배정: 0, 빈슬롯: 0 };
    for (const s of slots) {
      const c = s && s.분류;
      if (c === '상향' || c === '적정' || c === '안정') {
        out[c]++;
        out.배정++;
      } else {
        out.빈슬롯++;
      }
    }
    return out;
  }
```

`return { THRESHOLD, classify };` → `return { THRESHOLD, classify, RECOMMENDED, balanceSummary };`

- [ ] **Step 4: 통과 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: PASS (7 passed, 0 failed)

- [ ] **Step 5: 커밋**

```bash
git add susi-logic.js tests/susi-logic.test.mjs
git commit -m "feat: add 수시 6장 balance summary"
```

---

## Task 3: 학생 데이터 직렬화/역직렬화 `serializeStudents` / `deserializeStudents`

**Files:**
- Modify: `susi-logic.js`
- Test: `tests/susi-logic.test.mjs`

**Interfaces:**
- Produces:
  - `SusiLogic.serializeStudents(students: Array) => string` (JSON, 들여쓰기 2)
  - `SusiLogic.deserializeStudents(text: string) => Array` — 유효하지 않거나 배열이 아니면 `Error` throw
  - `SusiLogic.makeStudent(이름: string) => Student` — 빈 학생 객체(6개 빈 슬롯 포함, `id`는 `시드` 인자로 결정)
  - 시그니처: `makeStudent(이름, id)` — `id`는 호출부가 생성해 전달(로직은 시간/난수 미사용)

- [ ] **Step 1: 실패 테스트 추가**

```js
test('makeStudent: 기본 구조와 빈 슬롯 6개', () => {
  const s = SusiLogic.makeStudent('홍길동', 'stu-1');
  assert.equal(s.id, 'stu-1');
  assert.equal(s.이름, '홍길동');
  assert.equal(s.지원.length, 6);
  assert.deepEqual(s.지원[0], { slot: 1, 합격선id: '', 분류: '', 메모: '' });
  assert.deepEqual(s.상담, []);
  assert.ok(s.내신 && s.모의 && s.희망);
});

test('serialize/deserialize 라운드트립', () => {
  const a = [SusiLogic.makeStudent('A', 'id-a'), SusiLogic.makeStudent('B', 'id-b')];
  const round = SusiLogic.deserializeStudents(SusiLogic.serializeStudents(a));
  assert.deepEqual(round, a);
});

test('deserialize: 잘못된 JSON은 throw', () => {
  assert.throws(() => SusiLogic.deserializeStudents('{not json'));
});

test('deserialize: 배열이 아니면 throw', () => {
  assert.throws(() => SusiLogic.deserializeStudents('{"x":1}'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: FAIL — `SusiLogic.makeStudent is not a function`

- [ ] **Step 3: 구현** — `return` 직전에 추가, `return` 객체에 등록

```js
  function makeStudent(이름, id) {
    return {
      id,
      이름,
      학년반: '',
      내신: { 전과목: null, 주요과목: null },
      모의: { 국: null, 수: null, 영: null, 탐1: null, 탐2: null },
      희망: { 계열: '', 관심학과: [] },
      지원: Array.from({ length: 6 }, (_, i) => ({
        slot: i + 1, 합격선id: '', 분류: '', 메모: '',
      })),
      상담: [],
    };
  }

  function serializeStudents(students) {
    return JSON.stringify(students, null, 2);
  }

  function deserializeStudents(text) {
    const data = JSON.parse(text); // 잘못된 JSON이면 여기서 throw
    if (!Array.isArray(data)) throw new Error('학생 데이터는 배열이어야 합니다.');
    return data;
  }
```

`return {...};`에 `makeStudent, serializeStudents, deserializeStudents` 추가.

- [ ] **Step 4: 통과 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: PASS (11 passed, 0 failed)

- [ ] **Step 5: 커밋**

```bash
git add susi-logic.js tests/susi-logic.test.mjs
git commit -m "feat: add student factory and JSON serialize roundtrip"
```

---

## Task 4: 합격선DB 구조 + 조회 헬퍼 `getCutoff` / `filterCutoffs`

**Files:**
- Modify: `susi-logic.js`
- Test: `tests/susi-logic.test.mjs`

**Interfaces:**
- Produces:
  - `SusiLogic.합격선DB: Array<{id,대학,학과,계열,전형유형,모집인원,합격선등급,수능최저,비고}>` — 사용자가 채울 틀. 샘플 2건 포함.
  - `SusiLogic.getCutoff(id: string) => 항목|null`
  - `SusiLogic.filterCutoffs({계열?, 전형유형?} = {}) => Array` — 빈 값 필터는 무시(전체)

- [ ] **Step 1: 실패 테스트 추가**

```js
test('합격선DB: 배열이며 항목은 필수 필드를 가진다', () => {
  assert.ok(Array.isArray(SusiLogic.합격선DB));
  for (const row of SusiLogic.합격선DB) {
    for (const k of ['id','대학','학과','계열','전형유형','모집인원','합격선등급','수능최저','비고']) {
      assert.ok(k in row, `누락 필드: ${k}`);
    }
    assert.equal(typeof row.합격선등급, 'number');
  }
});

test('getCutoff: id로 조회, 없으면 null', () => {
  const first = SusiLogic.합격선DB[0];
  assert.equal(SusiLogic.getCutoff(first.id), first);
  assert.equal(SusiLogic.getCutoff('없는id'), null);
});

test('filterCutoffs: 계열/전형 필터, 빈 인자는 전체', () => {
  assert.equal(SusiLogic.filterCutoffs().length, SusiLogic.합격선DB.length);
  const 자연 = SusiLogic.filterCutoffs({ 계열: '자연' });
  assert.ok(자연.every(r => r.계열 === '자연'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: FAIL — `SusiLogic.합격선DB` undefined / not array

- [ ] **Step 3: 구현** — `THRESHOLD` 아래에 DB와 헬퍼 추가, `return`에 등록

```js
  // ── 합격선 DB (사용자가 채울 틀) ─────────────────────────────
  // 합격선등급: 등급(1.0~9.0, 낮을수록 우수). 예) 50%컷.
  // 새 항목을 추가할 때 id는 고유해야 합니다.
  const 합격선DB = [
    {
      id: 'sample-1', 대학: '○○대학교', 학과: '컴퓨터공학과', 계열: '자연',
      전형유형: '학생부교과', 모집인원: 30, 합격선등급: 2.3,
      수능최저: '3개합 6', 비고: '예시 데이터 — 실제 값으로 교체',
    },
    {
      id: 'sample-2', 대학: '○○대학교', 학과: '경영학과', 계열: '인문',
      전형유형: '학생부종합', 모집인원: 40, 합격선등급: 2.8,
      수능최저: '', 비고: '예시 데이터 — 실제 값으로 교체',
    },
  ];

  function getCutoff(id) {
    return 합격선DB.find((r) => r.id === id) || null;
  }

  function filterCutoffs(opts = {}) {
    const { 계열, 전형유형 } = opts;
    return 합격선DB.filter(
      (r) => (!계열 || r.계열 === 계열) && (!전형유형 || r.전형유형 === 전형유형)
    );
  }
```

`return {...};`에 `합격선DB, getCutoff, filterCutoffs` 추가.

- [ ] **Step 4: 통과 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: PASS (14 passed, 0 failed)

- [ ] **Step 5: 커밋**

```bash
git add susi-logic.js tests/susi-logic.test.mjs
git commit -m "feat: add 합격선DB skeleton and lookup helpers"
```

---

## Task 5: HTML 셸 + CSS + 상태/저장 + 학생 선택 바

**Files:**
- Create: `susi-counseling.html`
- Reference: `index.html:1-200` (디자인 토큰/카드 스타일 재사용)

**Interfaces:**
- Consumes: `SusiLogic.makeStudent`, `SusiLogic.serializeStudents/deserializeStudents`
- Produces (HTML 내부 전역):
  - `state = { students: [], currentId: null }`
  - `saveState()` — localStorage(`susi.students`, `susi.currentStudentId`)에 기록
  - `loadState()` — localStorage에서 복원
  - `currentStudent()` — 현재 선택 학생 객체 또는 null
  - `render()` — 전체 재렌더 진입점(이 태스크에선 학생 바만)
  - `genId()` — `'stu-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6)`

- [ ] **Step 1: 파일 생성** — `susi-counseling.html`

`index.html`의 `:root` CSS 변수 블록과 기본 `body/.container` 스타일을 그대로 가져와 헤더(hero)와 학생 선택 바를 만든다. 본문:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>수시 입시 상담 통합 대시보드</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
:root{ --bg:#fafaf7; --card:#fff; --ink:#1a1a1a; --sub:#6b6b6b; --accent:#1a56db; --accent-light:#e8f0fe;
  --green:#0d7c3e; --green-light:#e6f4ea; --red:#c5221f; --red-light:#fce8e6; --orange:#e37400; --orange-light:#fef7e0;
  --border:#e5e5e5; --radius:12px; }
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--ink);line-height:1.7;padding:24px 16px 80px;}
.container{max-width:860px;margin:0 auto;}
.hero{background:linear-gradient(135deg,#1a1a2e,#16213e 50%,#0f3460);color:#fff;border-radius:var(--radius);padding:32px;margin-bottom:20px;}
.hero h1{font-size:24px;font-weight:900;}
.hero p{font-size:14px;color:rgba(255,255,255,.8);margin-top:6px;}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:18px;}
.card h2{font-size:16px;font-weight:700;margin-bottom:14px;}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
input,select,textarea{font-family:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;}
button{font-family:inherit;font-size:14px;font-weight:600;padding:8px 14px;border:none;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;}
button.ghost{background:var(--accent-light);color:var(--accent);}
.tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;}
.tab{padding:8px 14px;border-radius:8px;background:#eee;color:var(--sub);cursor:pointer;font-weight:600;font-size:13px;}
.tab.active{background:var(--accent);color:#fff;}
.pill{display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;}
.pill.안정{background:var(--green-light);color:var(--green);}
.pill.적정{background:var(--orange-light);color:var(--orange);}
.pill.상향{background:var(--red-light);color:var(--red);}
.muted{color:var(--sub);font-size:13px;}
table{width:100%;border-collapse:collapse;font-size:13px;}
th,td{padding:8px;border-bottom:1px solid #f0f0f0;text-align:left;}
</style>
</head>
<body>
<div class="container">
  <div class="hero"><h1>수시 입시 상담 통합 대시보드</h1><p>성적 입력 → 합격 진단 → 수시 6장 전략 → 상담 기록</p></div>

  <div class="card" id="studentBar">
    <h2>학생</h2>
    <div class="row">
      <select id="studentSelect"></select>
      <input id="newStudentName" placeholder="새 학생 이름">
      <button id="addStudentBtn">+ 추가</button>
      <button class="ghost" id="exportBtn">JSON 내보내기</button>
      <button class="ghost" id="importBtn">JSON 불러오기</button>
      <input type="file" id="importFile" accept="application/json" style="display:none">
    </div>
    <div class="muted" id="studentSummary" style="margin-top:8px"></div>
  </div>

  <div class="tabs" id="tabs"></div>
  <div id="panel"></div>
</div>

<script src="susi-logic.js"></script>
<script>
'use strict';
const KEY_S = 'susi.students', KEY_C = 'susi.currentStudentId';
const state = { students: [], currentId: null };

function genId(){ return 'stu-' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function saveState(){
  localStorage.setItem(KEY_S, SusiLogic.serializeStudents(state.students));
  localStorage.setItem(KEY_C, state.currentId || '');
}
function loadState(){
  try { state.students = SusiLogic.deserializeStudents(localStorage.getItem(KEY_S) || '[]'); }
  catch { state.students = []; }
  state.currentId = localStorage.getItem(KEY_C) || null;
  if (!state.students.some(s => s.id === state.currentId))
    state.currentId = state.students[0] ? state.students[0].id : null;
}
function currentStudent(){ return state.students.find(s => s.id === state.currentId) || null; }

function renderStudentBar(){
  const sel = document.getElementById('studentSelect');
  sel.innerHTML = state.students.map(s =>
    `<option value="${s.id}" ${s.id===state.currentId?'selected':''}>${s.이름}</option>`).join('')
    || '<option value="">학생 없음</option>';
  const s = currentStudent();
  document.getElementById('studentSummary').textContent = s
    ? `현재: ${s.이름} · 내신 주요 ${s.내신.주요과목 ?? '-'} / 전과목 ${s.내신.전과목 ?? '-'}`
    : '학생을 추가하세요.';
}

function render(){ renderStudentBar(); /* 이후 태스크에서 탭/패널 추가 */ }

document.getElementById('addStudentBtn').onclick = () => {
  const name = document.getElementById('newStudentName').value.trim();
  if (!name) return;
  const stu = SusiLogic.makeStudent(name, genId());
  state.students.push(stu); state.currentId = stu.id;
  document.getElementById('newStudentName').value = '';
  saveState(); render();
};
document.getElementById('studentSelect').onchange = (e) => {
  state.currentId = e.target.value; saveState(); render();
};

loadState(); render();
</script>
</body>
</html>
```

- [ ] **Step 2: 로직 회귀 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: PASS (14 passed) — 로직 미변경 확인

- [ ] **Step 3: 브라우저 수동 확인**

`susi-counseling.html`을 브라우저로 열고: 이름 입력 후 "+ 추가" → 드롭다운에 학생이 보이고 요약이 갱신된다. 새로고침해도 학생이 유지된다(localStorage). 콘솔 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add susi-counseling.html
git commit -m "feat: HTML shell with student bar and localStorage state"
```

---

## Task 6: 탭 네비게이션 + 성적 입력 패널

**Files:**
- Modify: `susi-counseling.html`

**Interfaces:**
- Consumes: `currentStudent()`, `saveState()`, `render()`
- Produces:
  - `state.tab: string` (기본 `'성적'`)
  - `renderTabs()`, `renderPanel()` — `render()`가 호출
  - 탭 목록: `['성적','진단','수시6장','상담']`

- [ ] **Step 1: 탭/패널 라우팅 추가** — `render()` 교체 및 함수 추가

```js
state.tab = '성적';
const TABS = ['성적','진단','수시6장','상담'];

function renderTabs(){
  document.getElementById('tabs').innerHTML = TABS.map(t =>
    `<div class="tab ${t===state.tab?'active':''}" data-tab="${t}">${t}</div>`).join('');
  document.querySelectorAll('#tabs .tab').forEach(el =>
    el.onclick = () => { state.tab = el.dataset.tab; renderTabs(); renderPanel(); });
}

function renderPanel(){
  const s = currentStudent();
  const panel = document.getElementById('panel');
  if (!s){ panel.innerHTML = '<div class="card muted">먼저 학생을 추가하세요.</div>'; return; }
  if (state.tab === '성적') return renderScorePanel(s, panel);
  panel.innerHTML = '<div class="card muted">준비 중</div>';
}

function num(v){ return v === '' || v == null ? null : Number(v); }

function renderScorePanel(s, panel){
  panel.innerHTML = `
   <div class="card"><h2>① 성적 입력</h2>
    <div class="row">
      <label>내신 전과목 <input id="f_jeon" type="number" step="0.1" min="1" max="9" value="${s.내신.전과목 ?? ''}"></label>
      <label>내신 주요과목 <input id="f_ju" type="number" step="0.1" min="1" max="9" value="${s.내신.주요과목 ?? ''}"></label>
      <label>계열
        <select id="f_gye">${['','인문','자연','예체능'].map(g=>`<option ${g===s.희망.계열?'selected':''}>${g}</option>`).join('')}</select>
      </label>
    </div>
    <div class="row" style="margin-top:10px">
      ${['국','수','영','탐1','탐2'].map(k=>`<label>${k} <input class="f_mo" data-k="${k}" type="number" step="1" min="1" max="9" value="${s.모의[k] ?? ''}" style="width:60px"></label>`).join('')}
    </div>
    <div class="row" style="margin-top:10px"><button id="saveScore">저장</button></div>
   </div>`;
  document.getElementById('saveScore').onclick = () => {
    s.내신.전과목 = num(document.getElementById('f_jeon').value);
    s.내신.주요과목 = num(document.getElementById('f_ju').value);
    s.희망.계열 = document.getElementById('f_gye').value;
    document.querySelectorAll('.f_mo').forEach(el => { s.모의[el.dataset.k] = num(el.value); });
    saveState(); render();
  };
}
```

`render()`를 다음으로 교체:

```js
function render(){ renderStudentBar(); renderTabs(); renderPanel(); }
```

- [ ] **Step 2: 브라우저 수동 확인**

학생 선택 → "성적" 탭에서 내신/모의/계열 입력 후 저장 → 새로고침해도 값 유지, 상단 요약에 주요/전과목 반영. 탭 클릭 시 활성 탭 전환.

- [ ] **Step 3: 커밋**

```bash
git add susi-counseling.html
git commit -m "feat: tab navigation and 성적 입력 panel"
```

---

## Task 7: 진단 패널 (`classify` + `filterCutoffs`)

**Files:**
- Modify: `susi-counseling.html`

**Interfaces:**
- Consumes: `SusiLogic.filterCutoffs`, `SusiLogic.classify`, `currentStudent()`
- Produces: `renderDiagnosePanel(s, panel)`; 비교 기준 등급 = `s.내신.주요과목`

- [ ] **Step 1: 진단 패널 추가** — `renderPanel`에 분기 추가

`renderPanel` 안에 `if (state.tab === '진단') return renderDiagnosePanel(s, panel);` 추가하고 함수 작성:

```js
function renderDiagnosePanel(s, panel){
  const base = s.내신.주요과목;
  const rows = SusiLogic.filterCutoffs(
    s.희망.계열 ? { 계열: s.희망.계열 } : {}
  ).map(r => ({
    ...r,
    분류: base == null ? '-' : SusiLogic.classify(base, r.합격선등급),
  }));
  panel.innerHTML = `
   <div class="card"><h2>② 합격 가능성 진단</h2>
    <p class="muted">기준: 내신 주요과목 ${base ?? '(미입력)'} 등급 · 계열 ${s.희망.계열 || '전체'}</p>
    <table><thead><tr><th>대학</th><th>학과</th><th>전형</th><th>합격선</th><th>판정</th><th>수능최저</th></tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td>${r.대학}</td><td>${r.학과}</td><td>${r.전형유형}</td><td>${r.합격선등급}</td>
      <td>${r.분류==='-'?'<span class="muted">성적 입력 필요</span>':`<span class="pill ${r.분류}">${r.분류}</span>`}</td>
      <td>${r.수능최저||'-'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">해당 데이터 없음</td></tr>'}
    </tbody></table>
   </div>`;
}
```

- [ ] **Step 2: 브라우저 수동 확인**

성적 입력(주요과목) 후 "진단" 탭 → 합격선DB 항목이 상향/적정/안정 색상 pill로 표시. 계열 선택 시 해당 계열만 필터. 주요과목 미입력이면 "성적 입력 필요" 표시.

- [ ] **Step 3: 커밋**

```bash
git add susi-counseling.html
git commit -m "feat: 합격 가능성 진단 panel"
```

---

## Task 8: 수시 6장 보드 패널 (`balanceSummary`)

**Files:**
- Modify: `susi-counseling.html`

**Interfaces:**
- Consumes: `SusiLogic.합격선DB`, `SusiLogic.getCutoff`, `SusiLogic.classify`, `SusiLogic.balanceSummary`, `SusiLogic.RECOMMENDED`
- Produces: `renderBoardPanel(s, panel)`. 슬롯에 학과 배정 시 학생 주요과목으로 `분류` 자동 계산해 저장.

- [ ] **Step 1: 보드 패널 추가** — `renderPanel`에 `if (state.tab === '수시6장') return renderBoardPanel(s, panel);`

```js
function renderBoardPanel(s, panel){
  const base = s.내신.주요과목;
  const opts = SusiLogic.합격선DB.map(r =>
    `<option value="${r.id}">${r.대학} ${r.학과} (${r.전형유형}, ${r.합격선등급})</option>`).join('');
  const bal = SusiLogic.balanceSummary(s.지원);
  const R = SusiLogic.RECOMMENDED;
  panel.innerHTML = `
   <div class="card"><h2>③ 수시 6장 보드</h2>
    <p class="muted">권장 균형 — 상향 ${R.상향} / 적정 ${R.적정} / 안정 ${R.안정} · 현재
      <span class="pill 상향">상향 ${bal.상향}</span>
      <span class="pill 적정">적정 ${bal.적정}</span>
      <span class="pill 안정">안정 ${bal.안정}</span>
      · 빈 슬롯 ${bal.빈슬롯}</p>
    ${s.지원.map((slot,i)=>{
      const cur = SusiLogic.getCutoff(slot.합격선id);
      return `<div class="row" style="margin:8px 0">
        <b style="width:48px">${slot.slot}지망</b>
        <select class="slotSel" data-i="${i}" style="min-width:280px">
          <option value="">— 선택 —</option>
          ${opts.replace(`value="${slot.합격선id}"`, `value="${slot.합격선id}" selected`)}
        </select>
        ${cur && slot.분류 ? `<span class="pill ${slot.분류}">${slot.분류}</span>` : ''}
      </div>`;
    }).join('')}
   </div>`;
  document.querySelectorAll('.slotSel').forEach(el => el.onchange = () => {
    const i = +el.dataset.i, id = el.value;
    s.지원[i].합격선id = id;
    const cut = SusiLogic.getCutoff(id);
    s.지원[i].분류 = (cut && base != null) ? SusiLogic.classify(base, cut.합격선등급) : '';
    saveState(); renderPanel();
  });
}
```

- [ ] **Step 2: 브라우저 수동 확인**

"수시6장" 탭 → 6개 슬롯에서 학과 선택 시 상향/적정/안정 pill 자동 표시, 상단 균형 집계 갱신. 새로고침해도 배정 유지.

- [ ] **Step 3: 커밋**

```bash
git add susi-counseling.html
git commit -m "feat: 수시 6장 보드 with balance gauge"
```

---

## Task 9: 상담 기록 패널

**Files:**
- Modify: `susi-counseling.html`

**Interfaces:**
- Consumes: `currentStudent()`, `saveState()`
- Produces: `renderCounselPanel(s, panel)`. 기록 항목: `{날짜, 내용, 결정}`. 날짜 기본값은 `<input type="date">` 사용자가 선택(로직에 시간 사용 안 함).

- [ ] **Step 1: 상담 패널 추가** — `renderPanel`에 `if (state.tab === '상담') return renderCounselPanel(s, panel);`

```js
function renderCounselPanel(s, panel){
  panel.innerHTML = `
   <div class="card"><h2>④ 상담 기록</h2>
    <div class="row">
      <input id="c_date" type="date">
      <input id="c_text" placeholder="상담 내용" style="flex:1;min-width:200px">
      <input id="c_decision" placeholder="결정 사항" style="min-width:160px">
      <button id="c_add">기록 추가</button>
    </div>
    <table style="margin-top:12px"><thead><tr><th>날짜</th><th>내용</th><th>결정</th><th></th></tr></thead>
    <tbody>${s.상담.map((c,i)=>`<tr><td>${c.날짜||'-'}</td><td>${c.내용||''}</td><td>${c.결정||''}</td>
      <td><button class="ghost c_del" data-i="${i}">삭제</button></td></tr>`).join('')
      || '<tr><td colspan="4" class="muted">기록 없음</td></tr>'}</tbody></table>
   </div>`;
  document.getElementById('c_add').onclick = () => {
    const 내용 = document.getElementById('c_text').value.trim();
    if (!내용) return;
    s.상담.unshift({
      날짜: document.getElementById('c_date').value,
      내용,
      결정: document.getElementById('c_decision').value.trim(),
    });
    saveState(); renderPanel();
  };
  document.querySelectorAll('.c_del').forEach(el => el.onclick = () => {
    s.상담.splice(+el.dataset.i, 1); saveState(); renderPanel();
  });
}
```

- [ ] **Step 2: 브라우저 수동 확인**

"상담" 탭 → 날짜/내용/결정 입력 후 추가 → 목록 최상단에 표시, 삭제 동작, 새로고침 유지.

- [ ] **Step 3: 커밋**

```bash
git add susi-counseling.html
git commit -m "feat: 상담 기록 panel"
```

---

## Task 10: JSON 내보내기/불러오기 배선 + 최종 점검

**Files:**
- Modify: `susi-counseling.html`

**Interfaces:**
- Consumes: `SusiLogic.serializeStudents/deserializeStudents`, `state`, `saveState()`, `render()`

- [ ] **Step 1: 내보내기/불러오기 핸들러 추가** — 하단 `loadState(); render();` 앞에 삽입

```js
document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([SusiLogic.serializeStudents(state.students)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'susi-students.json';
  a.click(); URL.revokeObjectURL(a.href);
};
document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = SusiLogic.deserializeStudents(String(reader.result));
      state.students = data;
      state.currentId = data[0] ? data[0].id : null;
      saveState(); render();
      alert('불러오기 완료: ' + data.length + '명');
    } catch (err) { alert('불러오기 실패: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
};
```

- [ ] **Step 2: 로직 회귀 확인**

Run: `node tests/susi-logic.test.mjs`
Expected: PASS (14 passed, 0 failed)

- [ ] **Step 3: 전체 시나리오 수동 확인**

학생 2명 추가 → 각각 성적/진단/6장/상담 입력 → "JSON 내보내기"로 파일 저장 → localStorage 비우고(개발자도구) 새로고침 → "JSON 불러오기"로 복원 시 동일 데이터 표시. 콘솔 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add susi-counseling.html
git commit -m "feat: JSON export/import and final integration"
```

---

## Self-Review

- **Spec coverage:** 화면 5구성(학생바=T5, 성적=T6, 진단=T7, 6장=T8, 상담=T9), 데이터 모델(T3 학생/T4 DB), 진단 로직(T1), 균형(T2/T8), 백업(T10) — 전 항목 매핑됨.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TBD/생략 없음.
- **Type consistency:** `합격선id`/`분류`/`내신.주요과목`/`balanceSummary` 키(`상향/적정/안정/배정/빈슬롯`)가 전 태스크 일관. `classify(학생, 합격선)` 인자 순서 통일.
- 비고: 단일 HTML 요구를 지키되 순수 로직만 `susi-logic.js`로 분리(테스트 가능성). `<script src>`는 `file://`에서 CORS 무관.
