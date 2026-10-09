"""Analyze incident records with DSPy RLM, remote SQLite, and host-side sub-queries."""

import argparse
import json
import logging
import os
import sqlite3
from collections import Counter
from pathlib import Path

import dspy
from dotenv import load_dotenv

from dspy_e2b import E2BInterpreter

QUERY = """Analyze these incident records. In remote SQLite, select records with
service='inference', status='resolved', and severity='high'. Print their exact IDs.
For the selected records, prefer llm_query_batched with independent prompts to decide whether
actual request queue buildup caused the incident (one short prompt per record).
Do not classify using keyword matching alone. Aggregate the selected queue
incident IDs by region with SQL, inspect the counts, then SUBMIT all fields.
Pass computed variables to SUBMIT; do not retype IDs or counts as literals.
"""


class IncidentAnalysis(dspy.Signature):
    records: list[dict] = dspy.InputField()
    query: str = dspy.InputField()
    candidate_ids: list[str] = dspy.OutputField(desc="Exact SQL-filtered IDs, sorted")
    queue_incident_ids: list[str] = dspy.OutputField(desc="IDs classified as queue buildup, sorted")
    counts_by_region: dict[str, int] = dspy.OutputField(desc="SQL counts for queue_incident_ids")
    summary: str = dspy.OutputField(desc="Short explanation grounded in the selected records")


def interpreter_factory():
    return E2BInterpreter(execution_timeout=120, sandbox_timeout=600)


interpreter_factory.execution_instructions = E2BInterpreter.execution_instructions


def load_records(background_records=0):
    """Expand the small seed locally without adding semantic candidates."""
    if background_records < 0:
        raise ValueError("background_records must be non-negative")
    records = json.loads(Path(__file__).with_name("fixtures").joinpath("incidents.json").read_text())
    seed = records[-2:]
    records.extend(
        {**seed[index % len(seed)], "id": f"BACKGROUND-{index:06d}"} for index in range(background_records)
    )
    return records


def assess_fixture(records, result):
    """Check deterministic structure separately from fixture semantic labels."""
    with sqlite3.connect(":memory:") as db:
        db.execute("CREATE TABLE incidents(id TEXT, service TEXT, status TEXT, severity TEXT)")
        db.executemany(
            "INSERT INTO incidents VALUES (?, ?, ?, ?)",
            [(row["id"], row["service"], row["status"], row["severity"]) for row in records],
        )
        candidates = [
            row[0]
            for row in db.execute(
                "SELECT id FROM incidents WHERE service='inference' "
                "AND status='resolved' AND severity='high' ORDER BY id"
            )
        ]
    selected = result.queue_incident_ids
    if (
        result.candidate_ids != candidates
        or selected != sorted(set(selected))
        or not set(selected) <= set(candidates)
    ):
        raise ValueError("Output IDs do not match the deterministic candidate filter")
    regions = {row["id"]: row["region"] for row in records}
    expected_counts = dict(Counter(regions[record_id] for record_id in selected))
    if result.counts_by_region != expected_counts:
        raise ValueError("Region counts do not match the submitted IDs")
    return {
        "exact_ids_and_counts": "passed",
        "fixture_semantic_labels_match": selected == ["INC-001", "INC-004", "INC-006"],
        "scope": "labelled seed plus optional low-severity background; not a general quality evaluation",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--background-records", type=int, default=0, help="Low-severity records to generate locally"
    )
    args = parser.parse_args(argv)
    records = load_records(args.background_records)
    load_dotenv()
    for name in ("E2B_API_KEY", "OPENAI_API_KEY"):
        if not os.getenv(name):
            raise SystemExit(f"Set {name} in your environment or .env")
    logging.basicConfig(level=logging.WARNING, format="%(message)s")
    logging.getLogger("dspy_e2b").setLevel(logging.INFO)
    lm = dspy.LM(
        os.getenv("MODEL", "openai/gpt-5.6-luna"),
        temperature=None,
        max_tokens=16000,
        timeout=20,
        num_retries=0,
        cache=False,
    )
    dspy.configure(lm=lm, adapter=dspy.ChatAdapter(use_json_adapter_fallback=False))
    rlm = dspy.RLM(
        IncidentAnalysis,
        interpreter_factory=interpreter_factory,
        max_iters=6,
        max_llm_calls=4,
        max_output_chars=4000,
    )
    result = rlm(records=records, query=QUERY)
    artifact = {
        "answer": {name: getattr(result, name) for name in IncidentAnalysis.output_fields},
        "fixture_assessment": assess_fixture(records, result),
        "trajectory": result.trajectory,
    }
    Path("result.json").write_text(json.dumps(artifact, indent=2) + "\n")
    print(json.dumps(artifact, indent=2))


if __name__ == "__main__":
    main()
