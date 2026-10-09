"""Small API-usage tasks with trusted expectations, kept on the evaluator host."""

import json


def case(records, expected):
    # Strings keep the dataset schema stable when customer names vary between cases.
    return {"input": json.dumps(records), "output": json.dumps(expected)}


def task(task_id, instruction, cases):
    return {
        "task_id": task_id,
        "prompt": [
            {
                "role": "user",
                "content": (
                    f"{instruction} Read one JSON array of records from stdin, "
                    "not one record per line. Each record has a string field named "
                    '"customer"; use it as the output key. '
                    "Print exactly one JSON object, with customer names as keys and "
                    "integer totals as values. Empty input must produce {}. "
                    "Write a complete Python program using only the standard library. "
                    "Read the actual stdin input rather than hardcoding records. "
                    "Return only a fenced python code block."
                ),
            }
        ],
        "test_cases": cases,
    }


TRAIN_TASKS = [
    task(
        "total-tokens",
        'Sum the integer "tokens" field of all API usage records for each customer.',
        [
            case([], {}),
            case(
                [
                    {"customer": "acme", "tokens": 12},
                    {"customer": "beta", "tokens": 3},
                    {"customer": "acme", "tokens": 8},
                ],
                {"acme": 20, "beta": 3},
            ),
            case(
                [
                    {"customer": "zero", "tokens": 0},
                    {"customer": "large", "tokens": 100000},
                ],
                {"zero": 0, "large": 100000},
            ),
        ],
    ),
    task(
        "request-counts",
        "Count API usage records for each customer.",
        [
            case([], {}),
            case(
                [{"customer": "acme"}, {"customer": "beta"}, {"customer": "acme"}],
                {"acme": 2, "beta": 1},
            ),
            case([{"customer": "one"}], {"one": 1}),
        ],
    ),
    task(
        "successful-tokens",
        'Sum the integer "tokens" field per customer, including only records whose '
        'integer "status" field equals 200. '
        "Omit customers with no included records.",
        [
            case([], {}),
            case(
                [
                    {"customer": "acme", "tokens": 4, "status": 200},
                    {"customer": "acme", "tokens": 9, "status": 500},
                    {"customer": "beta", "tokens": 2, "status": 200},
                ],
                {"acme": 4, "beta": 2},
            ),
            case([{"customer": "failed", "tokens": 5, "status": 400}], {}),
        ],
    ),
]

EVAL_TASKS = [
    task(
        "held-out-input-tokens",
        'Sum the integer "input_tokens" field per customer. '
        'Do not add the integer "output_tokens" field.',
        [
            case([], {}),
            case(
                [
                    {"customer": "new", "input_tokens": 5, "output_tokens": 40},
                    {"customer": "other", "input_tokens": 0, "output_tokens": 3},
                    {"customer": "new", "input_tokens": 7, "output_tokens": 1},
                ],
                {"new": 12, "other": 0},
            ),
        ],
    ),
    task(
        "held-out-errors",
        'Count records per customer whose integer "status" field is at least 400. '
        "Omit customers with no included records.",
        [
            case([], {}),
            case(
                [
                    {"customer": "new", "status": 400},
                    {"customer": "other", "status": 200},
                    {"customer": "new", "status": 503},
                ],
                {"new": 2},
            ),
        ],
    ),
]
