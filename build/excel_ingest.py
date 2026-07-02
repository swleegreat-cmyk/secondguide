#!/usr/bin/env python3
"""Parse the 수시 자료 v5 xlsx into clean JSON data structures.
Produces:
  - admission_results.json : canonical_univ -> {인문:[...],자연:[...],전체:[...]}  (real 합격선)
  - admission_info.json    : canonical_univ -> [{전형유형,전형명,모집인원,전형방법,수능최저여부,수능최저기준,고른기회분류}]
  - univ_region.json       : canonical_univ -> '서울'|'경기인천'|'충청'|'기타'
"""
import openpyxl, json, re, os

XLSX = '/root/.claude/uploads/cc6e0e76-fdf5-5e55-a082-664e43b1081b/bcc633c2-_________________v5.xlsx'
OUTDIR = os.path.dirname(__file__)

wb = openpyxl.load_workbook(XLSX, data_only=True)
def sheet(name): return [list(r) for r in wb[name].iter_rows(values_only=True)]

# ── Name canonicalization ──
ALIAS = {
    '서울과기대': '서울과학기술대학교', '서울여대': '서울여자대학교',
    '한국기술교대': '한국기술교육대학교', '경인교대': '경인교육대학교',
    '서울시립대': '서울시립대학교', '한국공학대': '한국공학대학교',
    '경상국립대': '경상국립대학교', '국립공주대': '공주대학교',
    '한경국립대': '한경국립대학교', '한국항공대': '한국항공대학교',
    '차의과학대': '차의과학대학교', '경희대(서울)': '경희대학교', '경희대(국제)': '경희대학교(국제)',
    '고려대(세종)': '고려대학교(세종)', '홍익대(세종)': '홍익대학교(세종)',
    '건국대(글로컬)': '건국대학교(글로컬)', '한국외대(글로벌)': '한국외국어대학교(글로벌)',
    '한국외대': '한국외국어대학교', '전남대(광주)': '전남대학교', '전남대(여수)': '전남대학교(여수)',
    '을지대(대전)': '을지대학교(대전)', '을지대(성남)': '을지대학교(성남)', '을지대(의정부)': '을지대학교(의정부)',
    '단국대(천안)': '단국대학교(천안)', '상명대(천안)': '상명대학교(천안)',
    '연세대(미래)': '연세대학교(미래)', '한양대(에리카)': '한양대학교(에리카)',
    '동국대(WISE)': '동국대학교(WISE)', '포항공대': 'POSTECH',
    '이화여대': '이화여자대학교', '숙명여대': '숙명여자대학교', '성신여대': '성신여자대학교',
    '덕성여대': '덕성여자대학교', '동덕여대': '동덕여자대학교', '서울여대': '서울여자대학교',
    '공주교대': '공주교육대학교', '청주교대': '청주교육대학교', '춘천교대': '춘천교육대학교',
    '광주교대': '광주교육대학교', '대구교대': '대구교육대학교', '부산교대': '부산교육대학교',
    '전주교대': '전주교육대학교', '진주교대': '진주교육대학교', '서울교대': '서울교육대학교',
    # adiga.json 축약 표기
    '가야대': '가야대학교(김해)',
    '건국대(글)': '건국대학교(글로컬)', '고려대(세)': '고려대학교(세종)',
    '단국대(죽전)': '단국대학교', '동국대(W)': '동국대학교(WISE)',
    '상명대(천)': '상명대학교(천안)', '연세대(미)': '연세대학교(미래)',
    '전남대(여)': '전남대학교(여수)', '중앙대(다빈치)': '중앙대학교(다빈치)',
    '한국외대(글)': '한국외국어대학교(글로벌)', '한양대(에)': '한양대학교(에리카)',
    '추계예대': '추계예술대학교', '한국체대': '한국체육대학교',
    '부산외대': '부산외국어대학교', '국립경국대': '안동대학교',
    '국립공주대': '공주대학교', '국립한국교통대': '한국교통대학교',
    '국립한밭대': '한밭대학교', '국립군산대': '군산대학교',
    '국립금오공대': '금오공과대학교', '국립목포대': '목포대학교',
    '국립창원대': '창원대학교', '국립한국해양대': '한국해양대학교',
    '국립강릉원주대': '강릉원주대학교', '국립부경대': '부경대학교',
    '국립목포해양대': '목포해양대학교',
}
def canon(n):
    if n is None: return ''
    n = str(n).replace(' ', '').strip()
    if not n: return ''
    if n in ALIAS: return ALIAS[n]
    if '(' in n:
        head, rest = n.split('(', 1); paren = '(' + rest
    else:
        head, paren = n, ''
    if head.endswith('대') and not head.endswith('대학교'):
        head = head + '학교'
    return head + paren

# ── Region classification (by Excel short name membership) ──
SEOUL = {'서울대','연세대','고려대','서강대','성균관대','한양대','중앙대','경희대','경희대(서울)',
    '한국외대','서울시립대','건국대','동국대','홍익대','숙명여대','국민대','숭실대','세종대','광운대',
    '명지대','상명대','가톨릭대','성신여대','덕성여대','동덕여대','서울여대','서경대','삼육대','한성대',
    '서울과기대','총신대','추계예술대','서울기독대','성공회대','한국성서대','서울한영대','감신대','장신대',
    '한국체육대','이화여대','서울신학대','서울장신대','한국항공대','KENTECH'}
GYEONGGI_INCHEON = {'가천대','아주대','인하대','인천대','경기대','수원대','용인대','대진대','신한대',
    '차의과학대','평택대','협성대','안양대','강남대','루터대','성결대','한세대','한신대','화성의과학대',
    '경동대','을지대(성남)','을지대(의정부)','인천가톨릭대','경인교대','한국외대(글로벌)','한양대(에리카)',
    '한국공학대','한경국립대','칼빈대','아신대'}
CHUNGCHEONG = {'충남대','충북대','한밭대','대전대','목원대','한남대','우송대','을지대','을지대(대전)',
    '건양대','순천향대','선문대','호서대','남서울대','백석대','상명대(천안)','단국대(천안)','국립공주대',
    '공주교대','한국교원대','한국교통대','청주교대','서원대','세명대','중원대','유원대','극동대','중부대',
    '건국대(글로컬)','홍익대(세종)','고려대(세종)','한국기술교대','KAIST','DGIST','청운대','한서대',
    '연세대(미래)','대전신학대','제주대'}
# note 제주대 not 충청 but keep target-list separate; will override below
CHUNGCHEONG.discard('제주대')

def region(short):
    if short in SEOUL: return '서울'
    if short in GYEONGGI_INCHEON: return '경기인천'
    if short in CHUNGCHEONG: return '충청'
    return '기타'

# ── 1. ADMISSION_RESULTS (real cutlines) ──
results = {}  # canon -> {인문:[],자연:[],전체:[]}
region_map = {}  # canon -> region

def add_result(short, gyeol, entry):
    c = canon(short)
    if not c: return
    if c not in results: results[c] = {'인문': [], '자연': [], '전체': []}
    results[c][gyeol].append(entry)
    if c not in region_map:
        region_map[c] = region(short)

def to_float(v):
    try: return round(float(v), 2)
    except: return None

# 1a. 인문/자연 합격성적 (계열-specific, has region)
for sheet_name, gyeol in [('인문_합격성적(2025수시)', '인문'), ('자연_합격성적(2025수시)', '자연')]:
    rows = sheet(sheet_name)
    for r in rows[1:]:
        # [평균등급,지역,계열,전형유형,대학,전형명,합격선(등급),충원율,학년도,출처]
        cut = to_float(r[6]) if r[6] is not None else to_float(r[0])
        if cut is None or cut < 0.5 or cut > 9.0: continue
        short = r[4]
        add_result(short, gyeol, {
            'jt': r[3] or '', 'jn': r[5] or '', 'cut': cut,
            'fill': (str(r[7]).replace('%','') if r[7] not in (None,'') else ''),
            'reg': r[1] or '', 'yr': str(r[8] or '2025')
        })

# 1b. 전형결과_롱포맷 수시 rows with 합격선값1 (계열 unknown -> 전체)
rows = sheet('전형결과_롱포맷')
for r in rows[1:]:
    # [대학,캠퍼스,집계단위,모집단위,모집시기,전형유형,전형명,학년도,모집인원,지원,경쟁률,점수체계,지표1,값1,지표2,값2,충원,출처]
    if r[4] != '수시': continue
    if '내신' not in str(r[11] or ''): continue  # only 내신등급 scale
    cut = to_float(r[13])
    if cut is None or cut < 1.0 or cut > 9.0: continue  # valid 등급만 (변환점수 제외)
    short = r[0]
    add_result(short, '전체', {
        'jt': r[5] or '', 'jn': r[6] or '', 'cut': cut,
        'ind': r[12] or '', 'cut2': to_float(r[15]), 'ind2': r[14] or '',
        'ratio': (str(r[10]) if r[10] not in (None,'') else ''),
        'fill': (str(r[16]) if r[16] not in (None,'') else ''),
        'yr': str(r[7] or '2024'), 'longfmt': 1
    })
    if canon(short) not in region_map:
        region_map[canon(short)] = region(short)

# ── 2. ADMISSION_INFO (전형정보 2027) ──
info = {}  # canon -> list
def add_info(short, entry):
    c = canon(short)
    if not c: return
    info.setdefault(c, []).append(entry)
    region_map.setdefault(c, region(short))

# 2a. 학교장추천_전형정보(2027)
rows = sheet('학교장추천_전형정보(2027)')
for r in rows[1:]:
    # [대학,캠퍼스,전형유형,전형명,모집인원,전형방법,고교추천인원,수능최저여부,수능최저기준,출처]
    if not r[0]: continue
    add_info(r[0], {
        'cat': '학교장추천', 'jt': r[2] or '', 'jn': r[3] or '',
        'num': str(r[4] or ''), 'method': r[5] or '',
        'rec': str(r[6] or ''), 'minYN': r[7] or '', 'min': r[8] or ''
    })

# 2b. 고른기회특별전형(2027) — only 수시
rows = sheet('고른기회특별전형(2027)')
for r in rows[1:]:
    # [대학,캠퍼스,모집시기,전형유형,전형명,모집인원,전형방법,수능최저여부,수능최저기준,고른기회분류,출처]
    if not r[0] or r[2] != '수시': continue
    add_info(r[0], {
        'cat': '고른기회', 'jt': r[3] or '', 'jn': r[4] or '',
        'num': str(r[5] or ''), 'method': r[6] or '',
        'minYN': r[7] or '', 'min': r[8] or '', 'eo': r[9] or ''
    })

# ── 2c. 학과(모집단위)별 전형정보 — 주요대학_전형비교(31개교) ──
dept_info = {}  # canon -> [{jt,unit,num,num_prev,delta,method,min,min_prev,changed}]
rows = sheet('주요대학_전형비교(31개교)')
cur_jt = ''
for r in rows:
    c0 = r[0]
    if c0 is None: continue
    c0s = str(c0).strip()
    if c0s.startswith('■') or c0s == '대학' or c0s.startswith('📋'):
        cur_jt = ''
        continue
    unit = r[2]
    if unit is None or str(unit).strip() in ('', '·'): continue
    jt = (str(r[1]).strip() if r[1] not in (None, '') else '')
    if jt: cur_jt = jt
    u = str(unit).strip().lstrip('└').strip()
    if u.startswith('└'): u = u[1:].strip()
    key = canon(c0s).replace('(서울)', '')
    dept_info.setdefault(key, []).append({
        'jt': cur_jt, 'unit': u,
        'num': str(r[3]).strip() if r[3] not in (None, '') else '',
        'num_prev': str(r[4]).strip() if r[4] not in (None, '') else '',
        'method': str(r[7]).strip() if r[7] not in (None, '') else '',
        'min': str(r[8]).strip() if r[8] not in (None, '') else '',
        'changed': str(r[10]).strip() if r[10] not in (None, '') else ''
    })

# ── 2d. 어디가 학과별 합격선 (adiga.json) → "대학명|학과명" 키로 정규화 ──
ADIGA = '/root/.claude/uploads/cc6e0e76-fdf5-5e55-a082-664e43b1081b/3152bd96-adiga.json'
ADIGA_REGION = {  # adiga 지역 → 프로그램 지역 체계
    '서울': '서울', '서울15': '서울',
    '경기': '경기인천', '인천': '경기인천',
    '대전': '충청', '충남': '충청', '충북': '충청', '세종': '충청',
}
dept_cutlines = {}   # "canonUniv|학과" -> [entry, ...]
univ_depts = {}      # canonUniv -> [학과, ...]
adiga_stats = {'rows': 0, 'univs': set(), 'graded': 0}
try:
    with open(ADIGA, encoding='utf-8') as f:
        adiga = json.load(f)
except FileNotFoundError:
    adiga = []

# ── 2d-0. 데이터 품질 처리 ──
def _grade_ok(v):
    """유효 등급(1~9) 판정. None 허용 안 함."""
    try:
        return 1.0 <= float(v) <= 9.0
    except (TypeError, ValueError):
        return False

def _num_or(v, default=-1):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default

# (1) 대학+학과+전형 중복 제거:
#     등급50/70이 더 완전한(결측 적은) 레코드 우선 → 둘 다 완전하면 모집인원 큰 쪽 → 동률이면 선착순
_groups = {}
for _r in adiga:
    _k = (str(_r.get('대학') or ''), str(_r.get('학과') or ''), str(_r.get('전형') or ''))
    _groups.setdefault(_k, []).append(_r)

_dropped = []
adiga_clean = []
for _k, _rows in _groups.items():
    if len(_rows) == 1:
        adiga_clean.append(_rows[0])
        continue
    def _rank(idx_row):
        _i, _row = idx_row
        completeness = int(_grade_ok(_row.get('등급50'))) + int(_grade_ok(_row.get('등급70')))
        return (-completeness, -_num_or(_row.get('모집인원')), _i)
    _sorted = sorted(enumerate(_rows), key=_rank)
    _keep = _sorted[0][1]
    adiga_clean.append(_keep)
    for _, _d in _sorted[1:]:
        _dropped.append({
            'key': ' | '.join(_k),
            'drop': {'등급50': _d.get('등급50'), '등급70': _d.get('등급70'), '모집인원': _d.get('모집인원')},
            'keep': {'등급50': _keep.get('등급50'), '등급70': _keep.get('등급70'), '모집인원': _keep.get('모집인원')},
        })

# (3) 검증 요약: 중복 처리·필드별 결측·등급 1~9 범위 밖 이상치
_miss = {f: sum(1 for _r in adiga_clean if _r.get(f) is None)
         for f in ('등급50', '등급70', '모집인원', '경쟁률', '추합')}
_both_missing = sum(1 for _r in adiga_clean
                    if _r.get('등급50') is None and _r.get('등급70') is None)
_only70_missing = sum(1 for _r in adiga_clean
                      if _r.get('등급50') is not None and _r.get('등급70') is None)
_oob = sum(1 for _r in adiga_clean for f in ('등급50', '등급70')
           if _r.get(f) is not None and not _grade_ok(_r.get(f)))

print('── adiga.json 데이터 검증 요약 ──')
print(f'원본 {len(adiga)}건 → 중복 제거 후 {len(adiga_clean)}건 (중복그룹 {len(_dropped)}건 탈락)')
print(f'결측: ' + ' · '.join(f'{f} {n}건' for f, n in _miss.items()))
print(f'등급50·70 둘 다 결측: {_both_missing}건 ({_both_missing/max(1,len(adiga_clean))*100:.1f}%) — 판정불가(경쟁률 참고 표시)')
print(f'등급70만 결측: {_only70_missing}건 — 등급50 기반 판정 + "70컷 정보 없음" 플래그')
print(f'등급 1~9 범위 밖 이상치: {_oob}건' + (' (제외 처리)' if _oob else ''))
print(f'중복 탈락 레코드 목록 ({len(_dropped)}건):')
for _d in _dropped:
    print(f"  [탈락] {_d['key']} — drop(등급50 {_d['drop']['등급50']}, 등급70 {_d['drop']['등급70']}, "
          f"모집 {_d['drop']['모집인원']}) < keep(등급50 {_d['keep']['등급50']}, 등급70 {_d['keep']['등급70']}, "
          f"모집 {_d['keep']['모집인원']})")

with open(os.path.join(OUTDIR, 'data_quality.json'), 'w', encoding='utf-8') as f:
    json.dump({'total_raw': len(adiga), 'total_clean': len(adiga_clean),
               'dup_dropped': _dropped, 'missing': _miss,
               'both_missing': _both_missing, 'only70_missing': _only70_missing,
               'out_of_range': _oob}, f, ensure_ascii=False, indent=1)

adiga = adiga_clean
for r in adiga:
    u = canon(r.get('대학'))
    dept = str(r.get('학과') or '').strip()
    if not u or not dept: continue
    g50, g70 = r.get('등급50'), r.get('등급70')
    def _g(v):
        try:
            v = float(v)
            return round(v, 2) if 0.5 <= v <= 9.0 else None
        except (TypeError, ValueError):
            return None
    g50, g70 = _g(g50), _g(g70)
    entry = {
        'jn': str(r.get('전형') or ''), 'jt': str(r.get('유형') or ''),
        'gy': str(r.get('계열') or ''), 'sub': str(r.get('소계열') or ''),
        'num': r.get('모집인원'), 'ratio': r.get('경쟁률'),
        'g50': g50, 'g70': g70, 'chu': r.get('추합'),
        'year': 2026,  # 어디가 최신 공시 (연도별 배열 확장 대비)
    }
    key = u + '|' + dept
    dept_cutlines.setdefault(key, []).append(entry)
    univ_depts.setdefault(u, [])
    if dept not in univ_depts[u]: univ_depts[u].append(dept)
    adiga_stats['rows'] += 1
    adiga_stats['univs'].add(u)
    if g50 or g70: adiga_stats['graded'] += 1
    # 지역 보강: adiga 지역으로 미분류 대학 채움
    if u not in region_map or region_map[u] == '기타':
        region_map[u] = ADIGA_REGION.get(str(r.get('지역') or ''), region_map.get(u, '기타'))

# ── 2e. 연도별 컷라인 시리즈 (YEAR_CUTLINES): "대학|계열|전형유형" → [{year,cut,ratio}] ──
# 단일 연도 단발 자료를 최근 3개년 배열로 확장:
#   2024=전형결과_롱포맷(통합), 2025=인문/자연 합격성적(계열별), 2026=어디가 학과별(계열 롤업)
def norm_jt(s):
    s = str(s or '')
    if '논술' in s: return '논술'
    if '종합' in s: return '종합'
    return '교과'

def _median(vals):
    vals = sorted(v for v in vals if v is not None)
    if not vals: return None
    n = len(vals); m = n // 2
    return round(vals[m] if n % 2 else (vals[m-1]+vals[m])/2, 2)

# year -> { "univ|계열|jt": [cuts] }
_yc_raw = {}
def add_yc(univ_c, gyeol, jt, year, cut, ratio=None):
    if not univ_c or cut is None: return
    key = f"{univ_c}|{gyeol}|{jt}"
    _yc_raw.setdefault(key, {}).setdefault(year, {'cuts': [], 'ratios': []})
    _yc_raw[key][year]['cuts'].append(cut)
    if ratio not in (None, ''):
        try: _yc_raw[key][year]['ratios'].append(float(ratio))
        except (TypeError, ValueError): pass

# 2025: 인문/자연 (계열별)
for sheet_name, gyeol in [('인문_합격성적(2025수시)', '인문'), ('자연_합격성적(2025수시)', '자연')]:
    for r in sheet(sheet_name)[1:]:
        cut = to_float(r[6]) if r[6] is not None else to_float(r[0])
        if cut is None or cut < 0.5 or cut > 9.0: continue
        add_yc(canon(r[4]), gyeol, norm_jt(r[3]), 2025, cut)

# 2024: 전형결과_롱포맷 (계열 없음 → '통합')
for r in sheet('전형결과_롱포맷')[1:]:
    if r[4] != '수시' or '내신' not in str(r[11] or ''): continue
    cut = to_float(r[13])
    if cut is None or cut < 1.0 or cut > 9.0: continue
    add_yc(canon(r[0]), '통합', norm_jt(r[5]), 2024, cut, r[10])

# 2026: 어디가 학과별 → 계열별 롤업
for r in adiga:
    u = canon(r.get('대학'))
    g50, g70 = _g(r.get('등급50')), _g(r.get('등급70'))
    cut = g70 if g70 is not None else g50
    if u and cut is not None:
        add_yc(u, str(r.get('계열') or '통합'), norm_jt(r.get('유형')), 2026, cut, r.get('경쟁률'))

# 통합(2024) 값을 계열별 시리즈에도 반영해 최근 3개년 배열 완성
# _yc_year_map: "univ|계열|jt" -> { year: {cut, ratio} }
def _finalize_year(years):
    out = {}
    for y in years:
        cm = _median(years[y]['cuts'])
        rm = _median(years[y]['ratios']) if years[y]['ratios'] else None
        if cm is not None:
            out[y] = {'cut': cm, 'ratio': rm}
    return out

_fin = {k: _finalize_year(v) for k, v in _yc_raw.items()}
# 통합 키에서 univ|jt별 2024 값 추출
tonghap_2024 = {}
for key, ym in _fin.items():
    u, gy, jt = key.split('|')
    if gy == '통합' and 2024 in ym:
        tonghap_2024[f"{u}|{jt}"] = ym[2024]

YEAR_CUTLINES = {}
for key, ym in _fin.items():
    u, gy, jt = key.split('|')
    if gy == '통합':
        continue  # 통합은 계열 시리즈에 병합, 단독 노출 안 함
    merged = dict(ym)
    # 2024 통합값이 있고 자체 2024가 없으면 보강
    t24 = tonghap_2024.get(f"{u}|{jt}")
    if t24 and 2024 not in merged:
        merged[2024] = t24
    series = [{'year': y, 'cut': merged[y]['cut'], 'ratio': merged[y]['ratio']}
              for y in sorted(merged.keys())]
    if series:
        YEAR_CUTLINES[key] = series

yc_multi = sum(1 for s in YEAR_CUTLINES.values() if len(s) >= 2)
yc_three = sum(1 for s in YEAR_CUTLINES.values() if len(s) >= 3)

# ── 2f. 표본 수 기반 신뢰도 등급 (학과별 · 대학별) ──
def confidence_grade(n):
    """ADM_RESULTS 표본(전형) 수에 따른 신뢰도 등급."""
    if n >= 10: return '높음'
    if n >= 3:  return '보통'
    return '낮음'

# 학과별: "대학|학과" → {samples, grade} (dept_cutlines 전형 엔트리 수)
# → 이 맵이 곧 '학과 데이터'의 신뢰도 필드 컨테이너로 최종 HTML에 baked 됨
DEPT_CONFIDENCE = {}
for key, entries in dept_cutlines.items():
    n = len(entries)
    DEPT_CONFIDENCE[key] = {'samples': n, 'grade': confidence_grade(n)}

# 대학별: 대학 → {samples, grade} (해당 대학 전체 학과 전형 엔트리 합)
UNIV_CONFIDENCE = {}
for key, entries in dept_cutlines.items():
    u = key.split('|', 1)[0]
    UNIV_CONFIDENCE.setdefault(u, 0)
    UNIV_CONFIDENCE[u] += len(entries)
UNIV_CONFIDENCE = {u: {'samples': n, 'grade': confidence_grade(n)} for u, n in UNIV_CONFIDENCE.items()}

conf_dist = {'높음': 0, '보통': 0, '낮음': 0}
for v in DEPT_CONFIDENCE.values():
    conf_dist[v['grade']] += 1

# ── 3. Finalize region_map with explicit region label for display ──
REGION_LABEL = {'서울': '서울', '경기인천': '경기·인천', '충청': '충청권', '기타': '기타'}
region_out = {k: v for k, v in region_map.items()}

# ── Write ──
def dump(obj, name):
    with open(os.path.join(OUTDIR, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))

dump(results, 'admission_results.json')
dump(info, 'admission_info_2027.json')
dump(region_out, 'univ_region.json')
dump(dept_info, 'dept_info.json')
dump(dept_cutlines, 'dept_cutlines.json')
dump(YEAR_CUTLINES, 'year_cutlines.json')
dump(univ_depts, 'univ_depts.json')
dump(DEPT_CONFIDENCE, 'dept_confidence.json')
dump(UNIV_CONFIDENCE, 'univ_confidence.json')

# Stats
n_results = sum(len(v['인문'])+len(v['자연'])+len(v['전체']) for v in results.values())
print(f'ADMISSION_RESULTS: {len(results)} univs, {n_results} entries')
print(f'ADMISSION_INFO: {len(info)} univs, {sum(len(v) for v in info.values())} entries')
print(f'UNIV_REGION: {len(region_out)} univs')
print(f'DEPT_CUTLINES(어디가): {len(dept_cutlines)} 학과키, {adiga_stats["rows"]} 전형행, '
      f'{len(adiga_stats["univs"])} 대학, 등급有 {adiga_stats["graded"]}')
print(f'YEAR_CUTLINES(연도별): {len(YEAR_CUTLINES)} 시리즈, 2년+ {yc_multi}, 3년 {yc_three}')
print(f'DEPT_CONFIDENCE(신뢰도): {len(DEPT_CONFIDENCE)} 학과 · 분포 {conf_dist}')
from collections import Counter
print('  region dist:', dict(Counter(region_out.values())))
print('  서울 sample:', [k for k,v in region_out.items() if v=='서울'][:12])
print('  충청 sample:', [k for k,v in region_out.items() if v=='충청'][:12])
