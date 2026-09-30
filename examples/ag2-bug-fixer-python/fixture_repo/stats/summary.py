def mean(values: list[float]) -> float:
    if not values:
        raise ValueError("mean() of an empty list")
    return sum(values) / len(values)


def median(values: list[float]) -> float:
    if not values:
        raise ValueError("median() of an empty list")
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle] + ordered[middle + 1]) / 2
