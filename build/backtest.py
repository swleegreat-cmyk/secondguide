#!/usr/bin/env python3
"""backtest.py — ADM_RESULTS(실제 합격선 결과)로 calcCompositeScore 확률 모델 백테스트.

방법:
  - ADM_RESULTS의 각 합격선(등록자 컷, 등급)을 실제 결과의 '합격 경계'로 사용.
  - 경계 대비 여러 오프셋의 가상 지원자를 생성 → 실제 합불(경계 이상이면 합격) 결정.
  - calcCompositeScore의 컷 기반 확률 곡선(cutCurveProb)을 그대로 재현해 예측.
  - 예측 합불(확률≥50%)과 실제 합불을 비교 → 정확도(%)·오차율(Brier식 MAE) 산출.
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

# ── 7. 결과 출력 ──
print('══════════════════════════════════════════════')
print('  backtest.py — 가중치 재보정 + train/test 검증')
print('══════════════════════════════════════════════')
print(f'ADM_RESULTS 대학: {len(ADM_RESULTS)}개 · 합격선 케이스: {len(cutlines)}개')
print(f'분리 8:2 → train {len(train_cases)}개 / test {len(test_cases)}개')
print(f'그리드서치(train 전용): offset {GRID[0]}~{GRID[-1]} (step 0.05) × 전형 3종')
print('──────────────────────────────────────────────')
print(f'[재보정 전 — AI-0 기준] 전체 정확도: {base_acc}% · 오차율: {base_err}%')
print('[재보정 후 — train 최적 가중치]')
for jt in ('교과', '종합', '논술'):
    print(f'  {jt}: offset {best_weights[jt]["offset"]:+}')
print('──────────────────────────────────────────────')
print(f'train 정확도: {train_acc}% / test 정확도: {test_acc}%')
print(f'  (train 오차율 {train_err}% · test 오차율 {test_err}%)')
print(f'전체 재보정 후 정확도: {opt_acc}% (AI-0 {base_acc}% 대비 {round(opt_acc-base_acc,1):+}%p)')
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
    json.dump({'baseline_accuracy': base_acc, 'accuracy': opt_acc,
               'train_accuracy': train_acc, 'test_accuracy': test_acc, 'overfit_gap': overfit_gap,
               'error_rate': opt_err, 'total': total, 'cases': len(cutlines), 'weights': best_weights},
              f, ensure_ascii=False, indent=1)
print(f'\n최적 가중치 저장: composite_weights.json → {json.dumps(best_weights, ensure_ascii=False)}')
