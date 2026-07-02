#!/usr/bin/env python3
"""Build the complete 수시 상담 프로그램 2027 HTML."""
import json, csv, re, os

UPLOAD = '/root/.claude/uploads/cc6e0e76-fdf5-5e55-a082-664e43b1081b'
OUTPUT = '/home/user/secondguide/susi-counseling-2027.html'

# ── 1. Load and compact student data ──
with open(f'{UPLOAD}/6bbb1fdf-students______.json', encoding='utf-8') as f:
    full_students = json.load(f)

students_compact = []
for key in sorted(full_students.keys()):
    s = full_students[key]
    subjects = []
    for sub in s.get('subjects_detail', []):
        compact = {
            'y': sub['학년'], 's': sub['학기'],
            'g': sub.get('grade'), 'u': sub.get('unit', 0),
            'n': sub['과목명'], 'c': sub['교과']
        }
        if sub.get('achievement'): compact['a'] = sub['achievement']
        if sub.get('is_career'): compact['ic'] = 1
        subjects.append(compact)

    records = []
    for r in s.get('record', []):
        rec = {'y': r.get('학년', 0), 't': r.get('type', ''), 'b': r.get('내용', '')}
        if r.get('교과명'): rec['c'] = r['교과명']
        if r.get('학기표시'): rec['sem'] = r['학기표시']
        records.append(rec)

    opinions = []
    for o in s.get('eval', {}).get('행동특성및종합의견', []):
        opinions.append({'y': o['학년'], 'b': o['내용']})

    students_compact.append({
        'name': s['name'],
        'seat': s.get('class_seat', 0),
        'subjects': subjects,
        'records': records,
        'opinions': opinions
    })

students_compact.sort(key=lambda x: x['seat'])

# ── 2. Load analysis data ──
with open(f'{UPLOAD}/d5b06124-students______.json', encoding='utf-8') as f:
    analysis_raw = json.load(f)

analysis_data = {}
for key, val in analysis_raw.items():
    seat = val.get('번호', 0)
    analysis_data[seat] = {
        'name': val.get('이름', ''),
        'subj_avgs': val.get('강점약점', {}).get('교과별평균등급', {}),
        'str': [s['교과'] + '(' + str(s['평균등급']) + ')' for s in val.get('강점약점', {}).get('강점', [])],
        'wk': [s['교과'] + '(' + str(s['평균등급']) + ')' for s in val.get('강점약점', {}).get('약점', [])],
        'career_flow': val.get('진로일관성', {}).get('진로희망흐름', []),
        'career_data': val.get('진로일관성', {}).get('교과연관성_근거데이터', []),
        'alerts': [p['내용'] for p in val.get('교사미확인포인트', []) if p.get('유형') != '정보 공백']
    }

# ── 3. Parse 생기부 analysis markdown for deeper insights ──
with open(f'{UPLOAD}/2d3596ab-__________.md', encoding='utf-8') as f:
    md = f.read()

md_blocks = re.split(r'## (\d+)번 (.+)', md)
for i in range(1, len(md_blocks)-2, 3):
    seat = int(md_blocks[i])
    content = md_blocks[i+2]
    if seat in analysis_data:
        # Extract grade summary
        m = re.search(r'- 전체: (.+)', content)
        if m: analysis_data[seat]['grade_summary'] = m.group(1).strip()

# ── 4. Read naesin engine JS ──
with open(f'{UPLOAD}/37d55662-naesin_engine___.js', encoding='utf-8') as f:
    naesin_engine = f.read()

# ── 5. Read interview questions CSV ──
interview_bank = {}
with open(f'{UPLOAD}/267bbf6e-__________.csv', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        univ = (row.get('﻿입시연도') and row.get('대학명') or row.get('대학명', '')).strip()
        if not univ:
            for k, v in row.items():
                if '대학' in (k or '') and '코드' not in (k or ''):
                    univ = (v or '').strip()
                    break
        area = ''
        q_text = ''
        for k, v in row.items():
            if k and '평가' in k: area = (v or '').strip()
            if k and '문항' in k: q_text = (v or '').strip()
        if not univ or not q_text: continue
        if univ not in interview_bank:
            interview_bank[univ] = []
        interview_bank[univ].append({'area': area, 'q': q_text})

# ── 6. Read cutlines ──
cutlines = []
with open(f'{UPLOAD}/b740a827-cutlines___.csv', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        cutlines.append({
            'univ': row.get('대학명', '').strip(),
            'type': row.get('전형명', '').strip(),
            'cut': float(row.get('평균등급컷', '0')),
            'ratio': row.get('경쟁률', '').strip(),
            'min': row.get('수능최저', '').strip(),
            'reflect': row.get('reflect', '').strip(),
            'source': row.get('reflect_source', '').strip()
        })

# ── 7. Read admission info ──
with open(f'{UPLOAD}/4cb93056-admission_info___.json', encoding='utf-8') as f:
    admissions = json.load(f)

# ── 7b. Excel v5 data (real cutlines, 전형정보, region map) ──
SCRATCH = os.path.dirname(__file__)
# Regenerate from xlsx so the build stays reproducible
import subprocess, sys
# excel_ingest가 adiga.json 중복 처리·결측·이상치 검증 요약을 stdout으로 출력한다
subprocess.run([sys.executable, os.path.join(SCRATCH, 'excel_ingest.py')], check=True,
               cwd=SCRATCH)
with open(f'{SCRATCH}/admission_results.json', encoding='utf-8') as f:
    adm_results = json.load(f)
with open(f'{SCRATCH}/admission_info_2027.json', encoding='utf-8') as f:
    adm_info2027 = json.load(f)
with open(f'{SCRATCH}/univ_region.json', encoding='utf-8') as f:
    univ_region = json.load(f)
with open(f'{SCRATCH}/dept_info.json', encoding='utf-8') as f:
    dept_info = json.load(f)
with open(f'{SCRATCH}/dept_cutlines.json', encoding='utf-8') as f:
    dept_cutlines = json.load(f)
with open(f'{SCRATCH}/univ_depts.json', encoding='utf-8') as f:
    univ_depts = json.load(f)
with open(f'{SCRATCH}/year_cutlines.json', encoding='utf-8') as f:
    year_cutlines = json.load(f)
with open(f'{SCRATCH}/dept_confidence.json', encoding='utf-8') as f:
    dept_confidence = json.load(f)
with open(f'{SCRATCH}/univ_confidence.json', encoding='utf-8') as f:
    univ_confidence = json.load(f)

# ── 7c. 백테스트로 최적화된 확률 가중치 (COMPOSITE_WEIGHTS) ──
# backtest.py가 ADM_RESULTS로 그리드서치한 최적 가중치를 생성
subprocess.run([sys.executable, os.path.join(SCRATCH, 'backtest.py')], check=True,
               cwd=SCRATCH, stdout=subprocess.DEVNULL)
with open(f'{SCRATCH}/composite_weights.json', encoding='utf-8') as f:
    composite_weights = json.load(f)

# ── Build JSON strings ──
students_json = json.dumps(students_compact, ensure_ascii=False, separators=(',',':'))
analysis_json = json.dumps(analysis_data, ensure_ascii=False, separators=(',',':'))
cutlines_json = json.dumps(cutlines, ensure_ascii=False, separators=(',',':'))
interview_json = json.dumps(interview_bank, ensure_ascii=False, separators=(',',':'))
admissions_json = json.dumps(admissions, ensure_ascii=False, separators=(',',':'))
adm_results_json = json.dumps(adm_results, ensure_ascii=False, separators=(',',':'))
adm_info2027_json = json.dumps(adm_info2027, ensure_ascii=False, separators=(',',':'))
univ_region_json = json.dumps(univ_region, ensure_ascii=False, separators=(',',':'))
dept_info_json = json.dumps(dept_info, ensure_ascii=False, separators=(',',':'))
dept_cutlines_json = json.dumps(dept_cutlines, ensure_ascii=False, separators=(',',':'))
univ_depts_json = json.dumps(univ_depts, ensure_ascii=False, separators=(',',':'))
year_cutlines_json = json.dumps(year_cutlines, ensure_ascii=False, separators=(',',':'))
dept_confidence_json = json.dumps(dept_confidence, ensure_ascii=False, separators=(',',':'))
univ_confidence_json = json.dumps(univ_confidence, ensure_ascii=False, separators=(',',':'))
composite_weights_json = json.dumps(composite_weights, ensure_ascii=False, separators=(',',':'))

# ── 8. Build HTML ──
# Using template string approach with __TOKEN__ replacement
html_template = open(f'{os.path.dirname(__file__)}/template_v2.html', 'r', encoding='utf-8').read()
html = html_template
html = html.replace('__STUDENTS_JSON__', students_json)
html = html.replace('__ANALYSIS_JSON__', analysis_json)
html = html.replace('__CUTLINES_JSON__', cutlines_json)
html = html.replace('__INTERVIEW_JSON__', interview_json)
html = html.replace('__ADMISSIONS_JSON__', admissions_json)
html = html.replace('__ADM_RESULTS_JSON__', adm_results_json)
html = html.replace('__ADM_INFO2027_JSON__', adm_info2027_json)
html = html.replace('__UNIV_REGION_JSON__', univ_region_json)
html = html.replace('__DEPT_INFO_JSON__', dept_info_json)
html = html.replace('__DEPT_CUTLINES_JSON__', dept_cutlines_json)
html = html.replace('__UNIV_DEPTS_JSON__', univ_depts_json)
html = html.replace('__YEAR_CUTLINES_JSON__', year_cutlines_json)
html = html.replace('__DEPT_CONFIDENCE_JSON__', dept_confidence_json)
html = html.replace('__UNIV_CONFIDENCE_JSON__', univ_confidence_json)
html = html.replace('__COMPOSITE_WEIGHTS_JSON__', composite_weights_json)
html = html.replace('__NAESIN_ENGINE__', naesin_engine)
with open(f'{SCRATCH}/signal_dictionary.js', encoding='utf-8') as f:
    html = html.replace('__SIGNAL_DICT__', f.read())

with open(OUTPUT, 'w', encoding='utf-8') as f:
    f.write(html)

size_kb = os.path.getsize(OUTPUT) / 1024
print(f'Built: {OUTPUT}')
print(f'Size: {size_kb:.0f} KB ({size_kb/1024:.2f} MB)')
print(f'Students: {len(students_compact)}')
print(f'Analysis entries: {len(analysis_data)}')
print(f'Universities with interviews: {len(interview_bank)}')
print(f'Cutlines (legacy): {len(cutlines)}')
print(f'ADMISSION_RESULTS: {len(adm_results)} univs')
print(f'DEPT_INFO(학과별 전형): {len(dept_info)} univs')
print(f'DEPT_CUTLINES(어디가 학과별 합격선): {len(dept_cutlines)} 학과키 / {len(univ_depts)} univs')
print(f'YEAR_CUTLINES(연도별 배열): {len(year_cutlines)} 시리즈')
print(f'CONFIDENCE: 학과 {len(dept_confidence)} · 대학 {len(univ_confidence)}')
print(f'COMPOSITE_WEIGHTS(재보정): {composite_weights.get("_meta",{}).get("baseline_accuracy")}% → {composite_weights.get("_meta",{}).get("optimized_accuracy")}%')
print(f'ADMISSION_INFO_2027: {len(adm_info2027)} univs')
print(f'UNIV_REGION: {len(univ_region)} univs')
