import unittest

from stats import mean, median


class MeanTest(unittest.TestCase):
    def test_mean(self) -> None:
        self.assertEqual(mean([1, 2, 3, 4]), 2.5)

    def test_empty(self) -> None:
        with self.assertRaises(ValueError):
            mean([])


class MedianTest(unittest.TestCase):
    def test_odd_length(self) -> None:
        self.assertEqual(median([3, 1, 2]), 2)

    def test_even_length(self) -> None:
        self.assertEqual(median([4, 1, 3, 2]), 2.5)

    def test_two_values(self) -> None:
        self.assertEqual(median([10, 20]), 15)

    def test_empty(self) -> None:
        with self.assertRaises(ValueError):
            median([])


if __name__ == "__main__":
    unittest.main()
