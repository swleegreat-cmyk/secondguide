#!/usr/bin/env python3
"""backtest.py — 4구간 판정 일관성 검증 + 확률곡선 내부 보정.

[정답(ground truth) 구조 — 1번 항목 진단]
  이 스크립트가 쓸 수 있는 자료는 대학·학과 단위 '합격선'(등록자 컷 등급)뿐이며,
  개별 학생의 실제 합불 기록은 데이터셋에 존재하지 않는다(ADM_RESULTS·adiga 모두
  집계 공시값). 종전의 "정확도"는 합격선 ± 오프셋 합성 지원자를 '컷 이내=합격'으로
  정의한 순환 정답이라 실제 예측력이 아니다 → 목적을 '일관성 검증'으로 변경한다.

[일관성 검증 — 2번 항목]
  4구간 판정(classifyBand: s<g50 안정 / g50≤s≤g70 적정 / g70<s≤g70+0.2 소신 /
  그 밖 상향, 충원배수 cw≥1.0 시 소신→적정·적정→안정 상향)이 등급50/70 경계와
  모순되는 케이스를 어디가 학과 레코드 전수 × 경계 프로브 성적으로 검사한다.
  모순 정의:
    - 학생 등급이 70컷보다 유리(≤g70)한데 '상향' 판정
    - 학생 등급이 50컷보다 유리(<g50)한데 '안정'이 아닌 판정
    - 완충 밖(>g70+0.2)인데 '상향'이 아닌 판정 (충원보정은 상향 미적용)
    - 충원보정이 판정을 불리한 방향으로 바꾸는 경우
    - 같은 레코드에서 성적이 좋아지는데 판정이 나빠지는 경우 (단조성)

[그리드서치 — 유지 사유]
  cutCurveProb 오프셋 보정(COMPOSITE_WEIGHTS)은 화면의 내부 정렬·통계용 확률에
  여전히 쓰이므로 합성 경계 케이스 기반 보정을 '참고 지표'로 유지한다.
"""
import json, os

SCRATCH = os.path.dirname(os.path.abspath(__file__))

# ── 1. ADM_RESULTS(실제 합격선 결과) 로드 ──
with open(os.path.join(SCRATCH, 'admission_results.json'), encoding='utf-8') as f:
    ADM_RESULTS = json.load(f)

# ── 2. calcCompositeScore 확률 곡선 재현 (template_v2.html cutCurveProb와 동일) ──
def interpolate_anchors(val, anchors, fallback):
    for i in range(len(anchors) - 1):
        if anchors[i][0] <= val < anchors[i+1][0]:
            t = (val - anchors[i][0]) / (anchors[i+1][0] - anchors[i][0])
            return round(anchors[i][1] + t * (anchors[i+1][1] - anchors[i][1]))
    return fallback

ANCHORS = {
    '교과': [[-2.0,98],[-1.5,95],[-1.0,88],[-0.5,75],[-0.2,63],[0,50],[0.3,36],[0.5,27],[1.0,16],[1.5,10],[2.0,6],[3.0,3]],
    '종합': [[-2.0,92],[-1.5,85],[-1.0,75],[-0.5,64],[-0.2,56],[0,48],[0.3,40],[0.5,34],[1.0,24],[1.5,17],[2.0,12],[3.0,8]],
    '논술': [[-2.0,82],[-1.5,74],[-1.0,65],[-0.5,56],[-0.2,50],[0,45],[0.3,40],[0.5,36],[1.0,28],[1.5,22],[2.0,17],[3.0,12]],
}
CAPS = {'교과': (98, 3), '종합': (92, 8), '논술': (82, 12)}

def norm_jt(s):
    s = str(s or '')
    if '논술' in s: return '논술'
    if '종합' in s: return '종합'
    return '교과'

def cut_curve_prob(diff, jt, offset=0.0):
    """전형유형별 확률 곡선. offset>0 이면 50%-교차점을 우측(더 관대)으로 이동."""
    d = diff - offset
    hi, lo = CAPS[jt]
    if d <= -2.0: return hi
    if d >= 3.0: return lo
    p = interpolate_anchors(d, ANCHORS[jt], lo)
    return max(3, min(97, p))

# ── 3. 케이스 생성 + 백테스트 ──
# 실제 결과(합격선 C) 기준 지원자 오프셋. off<=0 이면 컷 이상(합격), off>0 이면 미달(불합격).
OFFSETS = [-1.0, -0.5, -0.2, 0.0, 0.3, 0.5, 1.0]

def collect_cutlines():
    """ADM_RESULTS를 순회하며 (cut, 전형유형) 합격선 목록 산출."""
    out = []
    for univ, data in ADM_RESULTS.items():
        for gyeol in ('인문', '자연', '전체'):
            for e in data.get(gyeol, []):
                cut = e.get('cut')
                if cut is None:
                    continue
                try:
                    cut = float(cut)
                except (TypeError, ValueError):
                    continue
                if cut < 0.5 or cut > 9.0:
                    continue
                out.append((cut, norm_jt(e.get('jt'))))
                # 롱포맷 전체 엔트리의 등록70%컷(cut2)도 별도 합격선으로 활용
                cut2 = e.get('cut2')
                if cut2 is not None:
                    try:
                        cut2 = float(cut2)
                        if 0.5 <= cut2 <= 9.0:
                            out.append((cut2, norm_jt(e.get('jt'))))
                    except (TypeError, ValueError):
                        pass
    return out

cutlines = collect_cutlines()

# ── train/test 8:2 분리 (결정론적: 정렬 후 5번째마다 test) ──
cutlines_sorted = sorted(cutlines, key=lambda x: (x[1], x[0]))
train_cases = [c for i, c in enumerate(cutlines_sorted) if i % 5 != 0]  # 80%
test_cases  = [c for i, c in enumerate(cutlines_sorted) if i % 5 == 0]  # 20%

def evaluate(weights, cases):
    """주어진 가중치·케이스집합으로 정확도·오차율·전형별 정확도 산출."""
    tot = 0; cor = 0; err = 0.0
    jt_stat = {}
    for cut, jt in cases:
        off_w = weights.get(jt, {}).get('offset', 0.0)
        for off in OFFSETS:
            grade = cut + off
            actual = 1 if grade <= cut + 1e-9 else 0
            prob = cut_curve_prob(grade - cut, jt, off_w)
            pred = 1 if prob >= 50 else 0
            tot += 1
            ok = (pred == actual)
            if ok: cor += 1
            err += abs(prob / 100.0 - actual)
            s = jt_stat.setdefault(jt, {'total': 0, 'correct': 0})
            s['total'] += 1
            if ok: s['correct'] += 1
    acc = round(cor / tot * 100, 1) if tot else 0.0
    er = round(err / tot * 100, 1) if tot else 0.0
    return acc, er, jt_stat, tot

def grid_search(cases):
    """train 케이스로만 전형유형별 최적 offset 탐색."""
    GRID = [round(-0.5 + 0.05 * i, 2) for i in range(21)]
    weights = {}
    for jt in ('교과', '종합', '논술'):
        jt_cuts = [(c, j) for (c, j) in cases if j == jt]
        best_off, best_acc = 0.0, -1.0
        for cand in GRID:
            cor = 0; tot = 0
            for cut, _ in jt_cuts:
                for off in OFFSETS:
                    grade = cut + off
                    actual = 1 if grade <= cut + 1e-9 else 0
                    prob = cut_curve_prob(grade - cut, jt, cand)
                    tot += 1
                    if (1 if prob >= 50 else 0) == actual: cor += 1
            acc = (cor / tot) if tot else 0
            if acc > best_acc + 1e-9 or (abs(acc - best_acc) < 1e-9 and abs(cand) < abs(best_off)):
                best_acc, best_off = acc, cand
        weights[jt] = {'offset': best_off}
    return weights, GRID

# ── 4. 재보정 전(AI-0 기준) — 전체 기준 ──
ZERO_W = {jt: {'offset': 0.0} for jt in ('교과', '종합', '논술')}
base_acc, base_err, base_jt, total = evaluate(ZERO_W, cutlines)

# ── 5. train 세트로만 그리드서치 → 최적 가중치 ──
best_weights, GRID = grid_search(train_cases)

# ── 6. train / test 각각 정확도 측정 ──
train_acc, train_err, train_jt, train_total = evaluate(best_weights, train_cases)
test_acc,  test_err,  test_jt,  test_total  = evaluate(best_weights, test_cases)
# 전체(train+test) 재보정 후 정확도 (배포 가중치의 전체 성능)
opt_acc, opt_err, opt_jt, _ = evaluate(best_weights, cutlines)

# 과적합 신호: train vs test 격차
overfit_gap = round(train_acc - test_acc, 1)
OVERFIT_THRESHOLD = 5.0  # %p — 이 이상이면 과적합 경고

# ── 6b. 4구간 판정 일관성 전수 검사 ──
with open(os.path.join(SCRATCH, 'dept_cutlines.json'), encoding='utf-8') as f:
    DEPT_CUTLINES = json.load(f)

def classify_band(s, g50, g70, cw=None):
    """template_v2.html classifyBand()와 동일한 사다리 재현."""
    if g50 is None and g70 is None:
        return None
    a = g50 if g50 is not None else g70
    b = g70 if g70 is not None else g50
    lo, hi = min(a, b), max(a, b)  # 역전 레코드(g50>g70) 정규화 — JS classifyBand와 동일
    if s < lo: band = '안정'
    elif s <= hi: band = '적정'
    elif s <= hi + 0.2: band = '소신'
    else: band = '상향'
    if cw is not None and cw >= 1.0:
        if band == '소신': band = '적정'
        elif band == '적정': band = '안정'
    return band

RANK = {'상향': 0, '소신': 1, '적정': 2, '안정': 3}
records = 0
contradictions = []
for key, entries in DEPT_CUTLINES.items():
    for e in entries:
        g50, g70, cw = e.get('g50'), e.get('g70'), e.get('cw')
        if g50 is None and g70 is None:
            continue  # 컷 결측 → 판정하지 않음(별도 표시) — 일관성 검사 대상 아님
        records += 1
        a = g50 if g50 is not None else g70
        b = g70 if g70 is not None else g50
        lo, hi = min(a, b), max(a, b)
        # 경계 프로브: 50컷 안쪽 / 50~70 사이 / 70컷 / 완충 안 / 완충 밖 (등급 1~9 클램프)
        probes = sorted({max(1.0, lo - 0.5), max(1.0, lo - 0.01), (lo + hi) / 2,
                         hi, min(9.0, hi + 0.1), min(9.0, hi + 0.3)})
        prev_rank = None
        for sgrade in probes:
            base = classify_band(sgrade, g50, g70)          # 보정 전
            band = classify_band(sgrade, g50, g70, cw)      # 보정 후(표시 판정)
            # (a) 70컷보다 유리한데 상향
            if sgrade <= hi and band == '상향':
                contradictions.append((key, sgrade, '유리한데 상향'))
            # (b) 50컷보다 유리한데 안정 아님
            if sgrade < lo and band != '안정':
                contradictions.append((key, sgrade, '50컷 유리한데 ' + band))
            # (c) 완충 밖인데 상향 아님
            if sgrade > hi + 0.2 + 1e-9 and band != '상향':
                contradictions.append((key, sgrade, '완충 밖인데 ' + band))
            # (d) 충원보정이 불리한 방향으로 작동
            if RANK[band] < RANK[base]:
                contradictions.append((key, sgrade, '보정이 불리 방향'))
            # (e) 성적이 나빠지는데(프로브 오름차순) 판정이 유리해짐 (단조성)
            if prev_rank is not None and RANK[band] > prev_rank:
                contradictions.append((key, sgrade, '단조성 위반'))
            prev_rank = RANK[band]

# ── 7. 결과 출력 ──
print('══════════════════════════════════════════════')
print('  backtest.py — 4구간 일관성 검증 + 확률곡선 보정')
print('══════════════════════════════════════════════')
print('[1. 정답(ground truth) 진단]')
print('  - 사용 자료: ADM_RESULTS(수박 합격선 집계) + 어디가 학과별 등급50/70 — 모두 집계 공시값')
print('  - 개별 학생의 실제 합불 기록: 데이터셋에 없음 (per-student outcome 부재)')
print('  - 종전 "정확도"의 정답 = 합격선 ± 오프셋 합성 케이스(컷 이내=합격 정의) → 순환 정답')
print('  → 목적을 "정확도 측정"에서 "일관성 검증"으로 변경 (개별 기록 확보 시 적중률로 교체 예정)')
print('──────────────────────────────────────────────')
print('[2. 4구간 판정 ↔ 등급50/70 경계 일관성 전수 검사]')
print(f'  검사 대상: 어디가 학과 레코드 {records}건 × 경계 프로브 6성적 (컷 결측 레코드는 판정 제외라 대상 아님)')
print(f'  모순 건수: {len(contradictions)}건' + (' ✓ (0건 = 판정이 경계와 완전 일치)' if not contradictions else ''))
for c in contradictions[:10]:
    print(f'    ⚠ {c[0]} s={c[1]} — {c[2]}')
print('──────────────────────────────────────────────')
print('[3. 개별 합불 기록 기반 적중률] 해당 없음 — 개별 학생 합불 기록이 데이터셋에 존재하지 않아')
print('  4구간 적중률(적정 판정 학생의 실제 합격 비율 등)은 산출 불가. 기록 확보 시 이 섹션을 교체한다.')
print('══════════════════════════════════════════════')
print('  [참고] 확률곡선(cutCurveProb) 오프셋 보정 — 내부 정렬·통계용')
print('══════════════════════════════════════════════')
print(f'ADM_RESULTS 대학: {len(ADM_RESULTS)}개 · 합격선 케이스: {len(cutlines)}개')
print(f'분리 8:2 → train {len(train_cases)}개 / test {len(test_cases)}개')
print(f'그리드서치(train 전용): offset {GRID[0]}~{GRID[-1]} (step 0.05) × 전형 3종')
print('──────────────────────────────────────────────')
print(f'[재보정 전] 합성 경계 재현율: {base_acc}% · 오차율: {base_err}% (합성 케이스 기준 — 실제 예측력 아님)')
print('[재보정 후 — train 최적 가중치]')
for jt in ('교과', '종합', '논술'):
    print(f'  {jt}: offset {best_weights[jt]["offset"]:+}')
print('──────────────────────────────────────────────')
print(f'train 재현율: {train_acc}% / test 재현율: {test_acc}% (합성 케이스)')
print(f'  (train 오차율 {train_err}% · test 오차율 {test_err}%)')
print(f'전체 재보정 후 재현율: {opt_acc}% (재보정 전 {base_acc}% 대비 {round(opt_acc-base_acc,1):+}%p)')
print('──────────────────────────────────────────────')
print(f'과적합 점검: train−test 격차 {overfit_gap:+}%p (임계 {OVERFIT_THRESHOLD}%p)')
print(f'  → {"과적합 신호 없음 (격차 작음)" if abs(overfit_gap) <= OVERFIT_THRESHOLD else "⚠ 과적합 의심 (격차 큼)"}')

# ── 8. 최적 가중치 저장 (build.py가 COMPOSITE_WEIGHTS로 굽는다) ──
composite_weights = {
    '교과': {'offset': best_weights['교과']['offset']},
    '종합': {'offset': best_weights['종합']['offset']},
    '논술': {'offset': best_weights['논술']['offset']},
    '_meta': {'baseline_accuracy': base_acc, 'optimized_accuracy': opt_acc,
              'train_accuracy': train_acc, 'test_accuracy': test_acc,
              'overfit_gap': overfit_gap, 'error_rate': opt_err,
              'cases': len(cutlines), 'train_cases': len(train_cases), 'test_cases': len(test_cases)}
}
with open(os.path.join(SCRATCH, 'composite_weights.json'), 'w', encoding='utf-8') as f:
    json.dump(composite_weights, f, ensure_ascii=False, indent=1)
with open(os.path.join(SCRATCH, 'backtest_baseline.json'), 'w', encoding='utf-8') as f:
    json.dump({'consistency_records': records, 'consistency_violations': len(contradictions),
               'baseline_accuracy': base_acc, 'accuracy': opt_acc,
               'train_accuracy': train_acc, 'test_accuracy': test_acc, 'overfit_gap': overfit_gap,
               'error_rate': opt_err, 'total': total, 'cases': len(cutlines), 'weights': best_weights},
              f, ensure_ascii=False, indent=1)
print(f'\n최적 가중치 저장: composite_weights.json → {json.dumps(best_weights, ensure_ascii=False)}')
