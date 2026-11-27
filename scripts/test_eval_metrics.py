import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from eval_metrics import (hit_at_k, mean, ndcg_at_k, percentile, recall_at_k,
                          reciprocal_rank)


class RecallTest(unittest.TestCase):
    def test_partial_and_full_recall(self):
        relevant = {("c", 1): 2, ("c", 2): 1}
        ranked = [("c", 1), ("x", 9), ("c", 2)]
        self.assertAlmostEqual(recall_at_k(ranked, relevant, 2), 0.5)
        self.assertAlmostEqual(recall_at_k(ranked, relevant, 3), 1.0)

    def test_requires_labels(self):
        with self.assertRaises(ValueError):
            recall_at_k([("c", 1)], {}, 5)


class RankTest(unittest.TestCase):
    def test_hit_and_mrr(self):
        relevant = {("c", 4): 1}
        self.assertEqual(hit_at_k([("a", 1), ("c", 4)], relevant, 2), 1.0)
        self.assertEqual(hit_at_k([("a", 1)], relevant, 5), 0.0)
        self.assertAlmostEqual(reciprocal_rank([("a", 1), ("c", 4)], relevant), 0.5)
        self.assertEqual(reciprocal_rank([("a", 1)], relevant), 0.0)


class NdcgTest(unittest.TestCase):
    def test_perfect_and_reversed(self):
        relevant = {("a", 1): 2, ("b", 2): 1}
        self.assertAlmostEqual(ndcg_at_k([("a", 1), ("b", 2)], relevant, 10), 1.0)
        reversed_score = ndcg_at_k([("b", 2), ("a", 1)], relevant, 10)
        expected = (1 + 3 / math.log2(3)) / (3 + 1 / math.log2(3))
        self.assertAlmostEqual(reversed_score, expected)
        self.assertLess(reversed_score, 1.0)

    def test_unjudged_gain_is_zero(self):
        relevant = {("a", 1): 2}
        self.assertAlmostEqual(ndcg_at_k([("z", 9), ("a", 1)], relevant, 10), 1 / math.log2(3))


class AggregateTest(unittest.TestCase):
    def test_mean_and_percentile(self):
        self.assertAlmostEqual(mean([1, 2, 3]), 2.0)
        self.assertEqual(mean([]), 0.0)
        self.assertAlmostEqual(percentile([10, 20, 30, 40], 0.5), 25.0)
        self.assertAlmostEqual(percentile([10, 20, 30, 40], 0.95), 38.5)
        self.assertEqual(percentile([], 0.5), 0.0)


if __name__ == "__main__":
    unittest.main()
