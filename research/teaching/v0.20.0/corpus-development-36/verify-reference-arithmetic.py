"""Evaluator arithmetic, independent of the product compiler.

Counts are manually transcribed from authored source records. This checks the
numerical reference, not source understanding, teaching quality or Scion.
"""
import json
from fractions import Fraction
from pathlib import Path

rows = []


def fraction(value):
    return {'exact': str(value), 'percentage': float(value * 100)}


def pool(case, counts, expected, edited, expected_edit):
    def calculate(parts):
        a, n, b, m = parts
        return Fraction(a+b, n+m), (Fraction(a, n)+Fraction(b, m))/2
    before, after = calculate(counts), calculate(edited)
    assert before == tuple(map(Fraction, expected)), case
    assert after == tuple(map(Fraction, expected_edit)), case
    rows.append({'id': case, 'operation': 'pooling', 'counts': counts,
                 'pooled': fraction(before[0]), 'equalGroups': fraction(before[1]),
                 'editedCounts': edited, 'editedPooled': fraction(after[0]),
                 'editedEqualGroups': fraction(after[1])})


def union(case, counts, expected, edited, expected_edit):
    def enumerate_allocations(values, limits):
        n, a, b = values
        valid = []
        for overlap in range(n+1):
            cells = [a-overlap, b-overlap, overlap, n-a-b+overlap]
            if min(cells) >= 0:
                assert sum(cells) == n
                valid.append({'overlap': overlap, 'union': a+b-overlap, 'cells': cells})
        bounds = [min(v['overlap'] for v in valid), max(v['overlap'] for v in valid),
                  min(v['union'] for v in valid), max(v['union'] for v in valid)]
        assert bounds == limits, (case, bounds, limits)
        return {'bounds': bounds, 'feasibleIntegerAllocations': len(valid),
                'endpointWitnesses': [valid[0], valid[-1]]}
    rows.append({'id': case, 'operation': 'union', 'counts': counts,
                 'before': enumerate_allocations(counts, expected), 'editedCounts': edited,
                 'after': enumerate_allocations(edited, expected_edit)})


def observed(case, counts, expected, edited_part, expected_edit):
    part, tested, total = counts
    value = Fraction(part, tested)
    assert value == Fraction(expected)
    after = Fraction(edited_part, tested)
    assert after == Fraction(expected_edit)
    rows.append({'id': case, 'operation': 'observed-subset', 'counts': counts,
                 'observed': fraction(value), 'populationExact': None,
                 'optionalPopulationBounds': [fraction(Fraction(part, total)),
                                              fraction(Fraction(part+total-tested, total))],
                 'editedObserved': fraction(after), 'editedPopulationExact': None})


pool('quantity-dev-01', [9,12,12,48], ['7/20','1/2'], [9,12,24,48], ['11/20','5/8'])
union('quantity-dev-02', [50,35,30], [15,30,35,50], [50,35,20], [5,20,35,50])
union('quantity-dev-03', [28,19,17], [8,17,19,28], [28,19,21], [12,19,21,28])
pool('quantity-dev-04', [18,24,20,80], ['19/52','1/2'], [18,24,40,80], ['29/52','5/8'])
observed('quantity-dev-05', [27,45,90], '3/5', 36, '4/5')
union('quantity-dev-06', [34,0,13], [0,0,13,13], [34,8,13], [0,8,13,21])
pool('quantity-dev-07', [2,8,7,28], ['1/4','1/4'], [2,8,14,28], ['4/9','3/8'])
observed('quantity-dev-08', [18,30,80], '3/5', 12, '2/5')
union('quantity-dev-09', [60,60,22], [22,22,60,60], [60,50,22], [12,22,50,60])
pool('quantity-dev-10', [0,12,9,18], ['3/10','1/4'], [6,12,9,18], ['1/2','1/2'])

# Resource arithmetic only. Feasibility and appropriateness of each design
# were reviewed separately; this is not a causal-identification checker.
allocations = [
    ('experiment-dev-01', 32, [16,16], [8,8,8,8]),
    ('experiment-dev-02', 24, [12,12], [6,6,6,6]),
    ('experiment-dev-03', 21, [11,10], [10,10,1]),
    ('experiment-dev-04', 24, [12,12], [6,6,6,6]),
    ('experiment-dev-05', 30, [15,15], [7,7,8,8]),
    ('experiment-dev-06', 20, [10,10], [5,5,5,5]),
    ('experiment-dev-07', 24, [12,12], [6,6,6,6]),
    ('experiment-dev-08', 18, [9,9], [4,4,5,5]),
    ('experiment-dev-09', 16, [8,8], [4,4,4,4]),
    ('experiment-dev-10', 20, [10,10], [5,5,5,5]),
]
for case, available, primary, alternative in allocations:
    assert sum(primary) == available and sum(alternative) == available, case

report = {'reviewer': 'implementer', 'productRuns': 0, 'modelCalls': 0,
          'inputNumbers': 'Manually transcribed from source records; not inferred by the product.',
          'quantity': rows,
          'experimentResources': [{'id': c, 'available': n, 'primary': a, 'alternative': b}
                                  for c,n,a,b in allocations],
          'limits': 'Exact rational arithmetic and exhaustive integer witnesses only. No model, complete-course, export or independent classroom acceptance claim.'}
Path(__file__).with_name('arithmetic-review.json').write_text(json.dumps(report, indent=2)+'\n')
