"""Small, dependency-free IR metrics used by scripts/evaluate_strategies.py."""

from math import log2


def _relevant_set(relevant):
    return {key for key, grade in relevant.items() if grade > 0}


def recall_at_k(ranked, relevant, k):
    """Macro recall for one query: retrieved relevant pages / all labeled pages."""
    if k < 1:
        raise ValueError("k must be positive")
    expected = _relevant_set(relevant)
    if not expected:
        raise ValueError("Query has no labeled relevant page")
    hits = sum(1 for key in ranked[:k] if key in expected)
    return hits / len(expected)


def hit_at_k(ranked, relevant, k):
    expected = _relevant_set(relevant)
    if not expected:
        raise ValueError("Query has no labeled relevant page")
    return 1.0 if any(key in expected for key in ranked[:k]) else 0.0


def reciprocal_rank(ranked, relevant):
    expected = _relevant_set(relevant)
    if not expected:
        raise ValueError("Query has no labeled relevant page")
    for index, key in enumerate(ranked, start=1):
        if key in expected:
            return 1.0 / index
    return 0.0


def ndcg_at_k(ranked, relevant, k):
    """Graded nDCG with gain 2^grade - 1 and log2 discount, as documented."""
    if k < 1:
        raise ValueError("k must be positive")
    if not relevant:
        raise ValueError("Query has no labels")
    gains = [relevant.get(key, 0) for key in ranked[:k]]
    dcg = sum((2 ** gain - 1) / log2(position + 2)
              for position, gain in enumerate(gains))
    ideal = sorted(relevant.values(), reverse=True)[:k]
    idcg = sum((2 ** gain - 1) / log2(position + 2)
               for position, gain in enumerate(ideal))
    return dcg / idcg if idcg else 0.0


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def percentile(values, fraction):
    """Linear-interpolation percentile; fraction in [0, 1]."""
    ordered = sorted(values)
    if not ordered:
        return 0.0
    if not 0 <= fraction <= 1:
        raise ValueError("fraction must be in [0, 1]")
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight
