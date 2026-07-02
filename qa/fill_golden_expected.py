#!/usr/bin/env python3
"""fill_golden_expected.py — 골든 케이스 기대환산점수 수동 산출 (엔진 코드와 독립).

NAESIN_RULES의 구조화된 규칙 명세를 사람이 읽고 케이스별로 직접 적용한다.
- 상위N 계열: 반영교과에서 등급 우수 순 N과목 → 등급 단순평균 (단위 미가중)
- 전과목 계열: 단위수 가중평균. '석차등급이 기재된' 명시 시 성취평가 과목 제외
- 진로선택: A=1, B=3, C=5 환산. 진로선택 전용 블록이 있으면 일반 블록에서 제외
- '적용' 라벨 변형(계열/전형별 상이)은 첫 번째 변형(대표) 기준 — 검산근거에 명시
구조가 자유서술형(문자열 선택수 등)이라 수동 산출이 모호한 케이스는 null 유지.
"""
import json, os

SCRATCH = os.path.dirname(os.path.abspath(__file__))
GC = os.path.join(SCRATCH, 'golden_cases.json')
cases = json.load(open(GC, encoding='utf-8'))
SUBJ = cases[0]['입력성적']  # 모든 케이스 공통 성적표

A_MAP = {'A': 1, 'B': 3, 'C': 5}

def val(s):
    return s['grade'] if s.get('grade') is not None else A_MAP.get(s.get('achievement'), 9)

def pool(groups=None, career=None, grades=None):
    """교과군/진로여부/학년 필터."""
    out = []
    for s in SUBJ:
        if groups is not None and s['교과'] not in groups: continue
        if career is not None and bool(s.get('is_career')) != career: continue
        if grades is not None and s['학년'] not in grades: continue
        out.append(s)
    return out

def topn(subjects, n):
    return sorted(subjects, key=lambda s: (val(s), -(s.get('unit') or 0)))[:n]

def simple_avg(subjects):
    return round(sum(val(s) for s in subjects) / len(subjects), 4)

def weighted_avg(subjects):
    tw = sum(s.get('unit') or 1 for s in subjects)
    return round(sum(val(s) * (s.get('unit') or 1) for s in subjects) / tw, 4)

def show(name, picked, avg, note):
    lst = ', '.join(f"{s['과목명']}{val(s)}" for s in picked)
    print(f"◆ {name}: {avg} ({len(picked)}과목) — {note}")
    print(f"   선발: {lst}")

# ── 케이스별 수동 산출 ──
expected = {}   # 대학명 → (기대값, 수동검산 근거 텍스트)

# 1. 건양대: 국수영+탐구(사·과) 교과구분 없이 최고 6과목, 진로선택 미반영
p = topn(pool(groups={'국어','수학','영어','사회','과학'}, career=False), 6)
expected['건양대학교'] = (simple_avg(p), '국수영사과 일반과목 중 최고 6과목 단순평균 (진로선택 미반영 명시)')
show('건양대학교', p, simple_avg(p), '규정: 교과구분없이 최고 6개')

# 2. 동국대: [변형1=인문계열] 국수사영+한국사 상위 10과목 (진로선택 배제 조항 없음 → 포함)
p = topn(pool(groups={'국어','수학','사회','영어','한국사'}), 10)
expected['동국대학교'] = (simple_avg(p), '인문계열(첫 변형) 기준: 국수사영한국사 상위 10과목 단순평균, 진로선택 포함')
show('동국대학교', p, simple_avg(p), '인문 변형: 상위 10과목')

# 3. 안양대: [변형1=인문사회] 국수영+사회(한국사포함) 상위 12과목
p = topn(pool(groups={'국어','수학','영어','사회','한국사'}), 12)
expected['안양대학교'] = (simple_avg(p), '인문사회(첫 변형) 기준: 국수영사(한국사포함) 상위 12과목 단순평균')
show('안양대학교', p, simple_avg(p), '인문사회 변형: 상위 12과목')

# 4. 평택대: [변형1=일반학생] 국수영사(역사/도덕)과+한국사 상위 9과목 (진로 3과목까지 포함가능)
p = topn(pool(groups={'국어','수학','영어','사회','과학','한국사'}), 9)
career_cnt = sum(1 for s in p if s.get('is_career'))
assert career_cnt <= 3, '진로선택 포함 상한(3) 초과'
expected['평택대학교'] = (simple_avg(p), f'일반학생전형(첫 변형) 기준: 전 교과군 상위 9과목 단순평균 (진로선택 {career_cnt}과목 포함 ≤ 상한 3)')
show('평택대학교', p, simple_avg(p), '일반학생 변형: 상위 9과목')

# 5. 한남대: [변형1=인문] 교과구분없이 우수 15과목 (진로선택 배제 조항 없음 → 포함)
p = topn(list(SUBJ), 15)
expected['한남대학교'] = (simple_avg(p), '인문(첫 변형) 기준: 교과구분없이 우수 15과목 단순평균, 진로선택 포함')
show('한남대학교', p, simple_avg(p), '인문 변형: 상위 15과목')

# 6. 가야대(김해): 국영수 6과목 + 사과한국사(체육) 2과목, 진로선택 최대 2과목 환산 포함
p1 = topn(pool(groups={'국어','영어','수학'}), 6)
p2 = topn(pool(groups={'사회','과학','한국사'}), 2)
career_cnt = sum(1 for s in p1 + p2 if s.get('is_career'))
assert career_cnt <= 2, '진로선택 상한(2) 초과'
v = simple_avg(p1 + p2)
expected['가야대학교(김해)'] = (v, f'국영수 상위6 + 탐구(사과한국사) 상위2 = 8과목 단순평균 (진로선택 {career_cnt}과목 ≤ 상한 2)')
show('가야대학교(김해)', p1 + p2, v, '6+2 교과군별')

# 7. 안동대: 국수영 7 + 사과한국사 2 + 진로선택(전체) 3 — 진로 블록 별도이므로 일반 블록은 일반과목만
p1 = topn(pool(groups={'국어','수학','영어'}, career=False), 7)
p2 = topn(pool(groups={'사회','과학','한국사'}, career=False), 2)
p3 = topn(pool(career=True), 3)
v = simple_avg(p1 + p2 + p3)
expected['안동대학교'] = (v, f'국수영7 + 사과한국사2 (일반과목) + 진로선택 상위3(보유 {len(p3)}과목) 단순평균')
show('안동대학교', p1 + p2 + p3, v, '7+2+진로3 교과군별')

# 8. 남서울대: 국수영사과한국사 일반·공통 상위 12 + 진로선택 3
p1 = topn(pool(groups={'국어','수학','영어','사회','과학','한국사'}, career=False), 12)
p2 = topn(pool(career=True), 3)
v = simple_avg(p1 + p2)
expected['남서울대학교'] = (v, f'일반·공통 상위 12과목 + 진로선택 상위3(보유 {len(p2)}과목) 단순평균')
show('남서울대학교', p1 + p2, v, '12+진로3 복합')

# 9. 백석대: 국영수사한국사과 일반 상위 15 + 진로과목 3
p1 = topn(pool(groups={'국어','영어','수학','사회','한국사','과학'}, career=False), 15)
p2 = topn(pool(career=True), 3)
v = simple_avg(p1 + p2)
expected['백석대학교'] = (v, f'일반 상위 15과목 + 진로선택 상위3(보유 {len(p2)}과목) 단순평균')
show('백석대학교', p1 + p2, v, '15+진로3 복합')

# 10. 루터대: 학년무관 국수영한국사사과 최고 4과목 + 진로선택 2과목
p1 = topn(pool(groups={'국어','수학','영어','한국사','사회','과학'}, career=False), 4)
p2 = topn(pool(career=True), 2)
v = simple_avg(p1 + p2)
expected['루터대학교'] = (v, f'일반 최고 4과목 + 진로선택 2과목 단순평균')
show('루터대학교', p1 + p2, v, '4+진로2')

# 11. 부산대: 반영교과 내 '석차등급이 기재된' 모든 과목 → 성취평가(진로) 제외, 단위수 가중평균
p = pool(groups={'국어','수학','영어','사회','과학','한국사'}, career=False)
p = [s for s in p if s.get('grade') is not None]
v = weighted_avg(p)
expected['부산대학교'] = (v, f'석차등급 기재 {len(p)}과목 단위수 가중평균 (성취평가 진로선택 제외 — 규정 명시)')
show('부산대학교', p, v, '전과목(석차등급 기재분)')

# ── golden_cases.json 반영 ──
filled = 0
for c in cases:
    u = c['대학명']
    if u in expected:
        v, basis = expected[u]
        c['기대환산점수'] = v
        c['검산근거'] += f"\n[수동검산] {basis} → 기대값 {v} (규칙 명세 기반 독립 산출, 엔진 미사용)"
        filled += 1
    elif c['기대환산점수'] is None:
        c['검산근거'] += "\n[수동검산] 규칙이 자유서술형(학과·전형별 상이 등)이라 구조 산출 불가 — 모집요강 원문 대조 후 기입 필요"

json.dump(cases, open(GC, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"\n기대값 채움: {filled}건 / 25건 (나머지 {25 - filled}건은 모집요강 수동 대조 대상으로 null 유지)")
