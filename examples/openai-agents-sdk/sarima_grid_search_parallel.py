from __future__ import annotations

import argparse
import asyncio
import copy
import json
import math
import os
import sys
import time
from typing import Any, TypedDict, cast

from pydantic import BaseModel, Field

from agents import Agent, ModelSettings, Runner, function_tool
from agents.run import RunConfig
from agents.sandbox import SandboxAgent, SandboxRunConfig

if __package__ is None or __package__ == "":
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from agents.extensions.sandbox import E2BSandboxClient, E2BSandboxClientOptions, E2BSandboxType
from examples.sandbox.misc.example_support import text_manifest
from examples.sandbox.misc.workspace_shell import WorkspaceShellCapability

DEFAULT_MODEL = "gpt-5.6-terra"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_MAX_CONCURRENCY = 3


class CandidateScore(BaseModel):
    id: str
    order: list[int] = Field(min_length=3, max_length=3)
    seasonal_order: list[int] = Field(min_length=4, max_length=4)
    aic: float | None = None
    bic: float | None = None
    rmse: float | None = None
    mae: float | None = None
    status: str
    notes: str | None = None
    artifacts: list[str] = Field(default_factory=list)


class BatchSearchResult(BaseModel):
    batch_name: str
    holdout: int
    sleep_seconds: float = 0.0
    batch_duration_seconds: float | None = None
    best_candidate_id: str | None = None
    best_order: list[int] | None = None
    best_seasonal_order: list[int] | None = None
    best_rmse: float | None = None
    best_mae: float | None = None
    candidate_results: list[CandidateScore]
    evidence_files: list[str] = Field(min_length=1)


class CoordinatorSummary(BaseModel):
    champion_batch: str
    champion_candidate: str
    champion_order: list[int] = Field(min_length=3, max_length=3)
    champion_seasonal_order: list[int] = Field(min_length=4, max_length=4)
    champion_rmse: float
    champion_mae: float
    rationale: str


class AgentParallelExecutionReport(BaseModel):
    final_output: CoordinatorSummary
    wall_time_seconds: float
    total_batch_duration_seconds: float
    total_tool_invocation_seconds: float
    likely_parallel: bool
    tool_call_count: int
    tool_invocation_durations: dict[str, float]
    batch_results: list[BatchSearchResult]


class LeaderboardRow(TypedDict):
    batch: str
    candidate: str
    order: tuple[int, ...]
    seasonal_order: tuple[int, ...]
    rmse: float | None
    mae: float | None
    aic: float | None
    bic: float | None
    status: str


def build_dataset_csv() -> str:
    months: list[str] = []
    values: list[float] = []
    year = 2021
    month = 1
    for index in range(48):
        months.append(f"{year:04d}-{month:02d}")
        seasonal = 18 * math.sin((2 * math.pi * index) / 12)
        shoulder = 6 * math.cos((2 * math.pi * index) / 6)
        trend = 210 + index * 2.8
        promo = 14 if index in {10, 22, 34, 46} else 0
        dip = -16 if index in {15, 27, 39} else 0
        values.append(round(trend + seasonal + shoulder + promo + dip, 2))
        month += 1
        if month == 13:
            month = 1
            year += 1

    rows = "\n".join(
        f"{month_label},{value}" for month_label, value in zip(months, values, strict=False)
    )
    return f"month,value\n{rows}\n"


DEFAULT_CANDIDATES: list[dict[str, object]] = [
    {"id": "cfg01", "order": [0, 1, 1], "seasonal_order": [0, 1, 1, 12]},
    {"id": "cfg02", "order": [1, 1, 1], "seasonal_order": [0, 1, 1, 12]},
    {"id": "cfg03", "order": [1, 1, 2], "seasonal_order": [0, 1, 1, 12]},
    {"id": "cfg04", "order": [2, 1, 1], "seasonal_order": [0, 1, 1, 12]},
    {"id": "cfg05", "order": [0, 1, 1], "seasonal_order": [1, 1, 0, 12]},
    {"id": "cfg06", "order": [1, 1, 1], "seasonal_order": [1, 1, 0, 12]},
    {"id": "cfg07", "order": [1, 1, 2], "seasonal_order": [1, 1, 0, 12]},
    {"id": "cfg08", "order": [2, 1, 1], "seasonal_order": [1, 1, 0, 12]},
    {"id": "cfg09", "order": [0, 1, 1], "seasonal_order": [1, 1, 1, 12]},
    {"id": "cfg10", "order": [1, 1, 1], "seasonal_order": [1, 1, 1, 12]},
    {"id": "cfg11", "order": [2, 1, 2], "seasonal_order": [1, 1, 1, 12]},
    {"id": "cfg12", "order": [2, 1, 1], "seasonal_order": [0, 1, 0, 12]},
]

DEFAULT_CANDIDATE_BATCHES: list[dict[str, object]] = [
    {
        "batch_name": f"batch-{offset // 4 + 1}",
        "holdout": 6,
        "candidates": DEFAULT_CANDIDATES[offset : offset + 4],
    }
    for offset in range(0, len(DEFAULT_CANDIDATES), 4)
]


def build_candidate_batches(
    *,
    batch_limit: int | None = None,
    sleep_seconds: float = 0.0,
) -> list[dict[str, object]]:
    batches = copy.deepcopy(DEFAULT_CANDIDATE_BATCHES)
    if batch_limit is not None:
        batches = batches[:batch_limit]
    for batch in batches:
        batch["sleep_seconds"] = sleep_seconds
    return batches


WORKER_SCRIPT = """\
import json
import subprocess
import sys
from pathlib import Path


def ensure_packages() -> None:
    modules = {
        "numpy": "numpy",
        "pandas": "pandas",
        "matplotlib": "matplotlib",
        "statsmodels": "statsmodels",
    }
    missing = []
    for module_name, package_name in modules.items():
        try:
            __import__(module_name)
        except Exception:
            missing.append(package_name)
    if missing:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", *missing])


ensure_packages()

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX


def load_series() -> pd.Series:
    frame = pd.read_csv("series.csv")
    frame["month"] = pd.to_datetime(frame["month"])
    frame = frame.sort_values("month")
    series = pd.Series(frame["value"].astype(float).to_numpy(), index=frame["month"])
    series.index.freq = "MS"
    return series


def fit_candidate(train: pd.Series, test: pd.Series, candidate: dict[str, object], artifacts_dir: Path) -> dict[str, object]:
    candidate_id = str(candidate["id"])
    order = tuple(int(x) for x in candidate["order"])
    seasonal_order = tuple(int(x) for x in candidate["seasonal_order"])
    forecast_artifact = artifacts_dir / f"{candidate_id}_forecast.png"
    residual_artifact = artifacts_dir / f"{candidate_id}_residuals.png"

    try:
        model = SARIMAX(
            train,
            order=order,
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        fitted = model.fit(disp=False)
        forecast = fitted.forecast(steps=len(test))
        actual = test.to_numpy(dtype=float)
        predicted = np.asarray(forecast, dtype=float)
        errors = actual - predicted
        rmse = float(np.sqrt(np.mean(errors ** 2)))
        mae = float(np.mean(np.abs(errors)))

        fig, ax = plt.subplots(figsize=(8, 4))
        ax.plot(train.index, train.to_numpy(dtype=float), label="train")
        ax.plot(test.index, actual, label="actual")
        ax.plot(test.index, predicted, label="forecast")
        ax.set_title(f"{candidate_id}: SARIMA{order}x{seasonal_order}")
        ax.legend()
        fig.tight_layout()
        fig.savefig(forecast_artifact)
        plt.close(fig)

        residuals = np.asarray(fitted.resid, dtype=float)
        fig, ax = plt.subplots(figsize=(8, 3))
        ax.plot(residuals)
        ax.axhline(0.0, color="black", linewidth=1)
        ax.set_title(f"{candidate_id}: residuals")
        fig.tight_layout()
        fig.savefig(residual_artifact)
        plt.close(fig)

        return {
            "id": candidate_id,
            "order": list(order),
            "seasonal_order": list(seasonal_order),
            "aic": float(fitted.aic),
            "bic": float(fitted.bic),
            "rmse": rmse,
            "mae": mae,
            "status": "ok",
            "notes": None,
            "artifacts": [forecast_artifact.as_posix(), residual_artifact.as_posix()],
        }
    except Exception as exc:
        return {
            "id": candidate_id,
            "order": list(order),
            "seasonal_order": list(seasonal_order),
            "aic": None,
            "bic": None,
            "rmse": None,
            "mae": None,
            "status": "failed",
            "notes": str(exc),
            "artifacts": [],
        }


def main() -> None:
    spec = json.loads(Path("batch.json").read_text())
    artifacts_dir = Path("artifacts")
    artifacts_dir.mkdir(exist_ok=True)
    sleep_seconds = float(spec.get("sleep_seconds", 0.0))

    series = load_series()
    horizon = int(spec.get("holdout", 6))
    train = series.iloc[:-horizon]
    test = series.iloc[-horizon:]
    started = __import__("time").perf_counter()

    if sleep_seconds > 0:
        __import__("time").sleep(sleep_seconds)

    results = [fit_candidate(train, test, candidate, artifacts_dir) for candidate in spec["candidates"]]
    ranked = sorted(
        [item for item in results if item["status"] == "ok" and item["rmse"] is not None],
        key=lambda item: (float(item["rmse"]), float(item["mae"])),
    )
    best = ranked[0] if ranked else None

    payload = {
        "batch_name": spec["batch_name"],
        "holdout": horizon,
        "sleep_seconds": sleep_seconds,
        "batch_duration_seconds": __import__("time").perf_counter() - started,
        "best_candidate_id": None if best is None else best["id"],
        "best_order": None if best is None else best["order"],
        "best_seasonal_order": None if best is None else best["seasonal_order"],
        "best_rmse": None if best is None else best["rmse"],
        "best_mae": None if best is None else best["mae"],
        "candidate_results": results,
        "evidence_files": ["results.json", "leaderboard.md", "series.csv", "batch.json"],
    }
    Path("results.json").write_text(json.dumps(payload, indent=2))

    lines = [
        f"# {spec['batch_name']} leaderboard",
        "",
        f"Holdout horizon: {horizon}",
        "",
        "| id | order | seasonal_order | rmse | mae | status |",
        "| --- | --- | --- | ---: | ---: | --- |",
    ]
    for item in results:
        lines.append(
            "| {id} | {order} | {seasonal_order} | {rmse} | {mae} | {status} |".format(
                id=item["id"],
                order=tuple(item["order"]),
                seasonal_order=tuple(item["seasonal_order"]),
                rmse="-" if item["rmse"] is None else f"{float(item['rmse']):.3f}",
                mae="-" if item["mae"] is None else f"{float(item['mae']):.3f}",
                status=item["status"],
            )
        )
    Path("leaderboard.md").write_text("\\n".join(lines) + "\\n")
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
"""


def make_manifest(batch_spec: dict[str, Any]):
    return text_manifest(
        {
            "README.md": (
                "Parallel SARIMA search worker.\n"
                "Use series.csv, batch.json, requirements.txt, and run_sarima_batch.py.\n"
            ),
            "series.csv": build_dataset_csv(),
            "batch.json": json.dumps(batch_spec, indent=2) + "\n",
            "requirements.txt": "numpy\npandas\nmatplotlib\nstatsmodels\n",
            "run_sarima_batch.py": WORKER_SCRIPT,
        }
    )


def make_run_config(
    *,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
) -> RunConfig:
    return RunConfig(
        sandbox=SandboxRunConfig(
            client=E2BSandboxClient(),
            options=E2BSandboxClientOptions(
                sandbox_type=sandbox_type,
                template=template,
                timeout=timeout_seconds,
                allow_internet_access=True,
                pause_on_exit=True,
            ),
        )
    )


def make_worker_agent(
    *,
    batch_name: str,
    manifest: Any,
    model: str,
) -> SandboxAgent:
    return SandboxAgent(
        name=f"SARIMA Worker {batch_name}",
        model=model,
        instructions=(
            "You run one batch of a SARIMA model search inside the sandbox. "
            "Inspect the workspace, execute the batch runner, read the generated outputs, "
            "and return the structured batch summary."
        ),
        developer_instructions=(
            "Use the shell tool before answering. Run `python -m pip install -q -r requirements.txt` "
            "if the dependencies are not already available, then run `python run_sarima_batch.py`. "
            "Read `results.json` and `leaderboard.md` before answering. Only cite files that exist "
            "in the sandbox and do not invent metrics."
        ),
        default_manifest=manifest,
        capabilities=[WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
        output_type=BatchSearchResult,
    )


async def run_candidate_batch(
    batch_spec: dict[str, Any],
    *,
    model: str = DEFAULT_MODEL,
    sandbox_type: E2BSandboxType = E2BSandboxType.E2B,
    template: str | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> BatchSearchResult:
    manifest = make_manifest(batch_spec)
    worker = make_worker_agent(
        batch_name=str(batch_spec["batch_name"]),
        manifest=manifest,
        model=model,
    )
    result = await Runner.run(
        worker,
        (
            "Run this SARIMA batch search now. Execute the worker script, then return the parsed "
            "structured result for this batch."
        ),
        run_config=make_run_config(
            sandbox_type=sandbox_type,
            template=template,
            timeout_seconds=timeout_seconds,
        ),
    )
    return cast(BatchSearchResult, result.final_output)


async def run_parallel_grid_search(
    *,
    batch_specs: list[dict[str, Any]] | None = None,
    model: str = DEFAULT_MODEL,
    sandbox_type: E2BSandboxType = E2BSandboxType.E2B,
    template: str | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
) -> list[BatchSearchResult]:
    selected_batches = DEFAULT_CANDIDATE_BATCHES if batch_specs is None else batch_specs
    semaphore = asyncio.Semaphore(max_concurrency)

    async def guarded(batch_spec: dict[str, Any]) -> BatchSearchResult:
        async with semaphore:
            return await run_candidate_batch(
                batch_spec,
                model=model,
                sandbox_type=sandbox_type,
                template=template,
                timeout_seconds=timeout_seconds,
            )

    tasks = [asyncio.create_task(guarded(batch_spec)) for batch_spec in selected_batches]
    return await asyncio.gather(*tasks)


def leaderboard_rows(batch_results: list[BatchSearchResult]) -> list[LeaderboardRow]:
    rows: list[LeaderboardRow] = []
    for batch in batch_results:
        for item in batch.candidate_results:
            rows.append(
                {
                    "batch": batch.batch_name,
                    "candidate": item.id,
                    "order": tuple(item.order),
                    "seasonal_order": tuple(item.seasonal_order),
                    "rmse": item.rmse,
                    "mae": item.mae,
                    "aic": item.aic,
                    "bic": item.bic,
                    "status": item.status,
                }
            )
    return rows


def ranked_rows(batch_results: list[BatchSearchResult]) -> list[LeaderboardRow]:
    return sorted(
        [
            row
            for row in leaderboard_rows(batch_results)
            if row["status"] == "ok" and row["rmse"] is not None and row["mae"] is not None
        ],
        key=lambda row: (cast(float, row["rmse"]), cast(float, row["mae"])),
    )


def require_credentials() -> None:
    missing = [name for name in ("OPENAI_API_KEY", "E2B_API_KEY") if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


def _batch_tool_output(result: BatchSearchResult) -> str:
    return json.dumps(result.model_dump(mode="json"), sort_keys=True)


def _build_agent_parallel_tools(
    *,
    batch_specs: list[dict[str, object]],
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
) -> tuple[list[Any], dict[str, BatchSearchResult], dict[str, float]]:
    collected_results: dict[str, BatchSearchResult] = {}
    collected_tool_durations: dict[str, float] = {}
    tools: list[Any] = []

    def _make_batch_tool(
        *,
        batch_spec: dict[str, object],
        tool_name: str,
        tool_description: str,
    ):
        @function_tool(name_override=tool_name, description_override=tool_description)
        async def _run_batch() -> str:
            started = time.perf_counter()
            result = await run_candidate_batch(
                batch_spec,
                model=model,
                sandbox_type=sandbox_type,
                template=template,
                timeout_seconds=timeout_seconds,
            )
            batch_name = str(batch_spec["batch_name"])
            collected_results[batch_name] = result
            collected_tool_durations[batch_name] = time.perf_counter() - started
            return _batch_tool_output(result)

        return _run_batch

    for batch_spec in batch_specs:
        batch_name = str(batch_spec["batch_name"])
        tool_name = f"run_{batch_name.replace('-', '_')}"
        tool_description = (
            f"Run the SARIMA grid-search worker for {batch_name}. "
            "This batch is fully independent from the others."
        )
        tools.append(
            _make_batch_tool(
                batch_spec=batch_spec,
                tool_name=tool_name,
                tool_description=tool_description,
            )
        )

    return tools, collected_results, collected_tool_durations


async def run_agent_parallel_grid_search(
    *,
    batch_specs: list[dict[str, object]] | None = None,
    model: str = DEFAULT_MODEL,
    sandbox_type: E2BSandboxType = E2BSandboxType.E2B,
    template: str | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> AgentParallelExecutionReport:
    selected_batches = build_candidate_batches() if batch_specs is None else batch_specs
    tools, collected_results, collected_tool_durations = _build_agent_parallel_tools(
        batch_specs=selected_batches,
        model=model,
        sandbox_type=sandbox_type,
        template=template,
        timeout_seconds=timeout_seconds,
    )
    coordinator = Agent(
        name="Parallel SARIMA Coordinator",
        model=model,
        instructions=(
            "You coordinate a SARIMA grid search across independent sandbox workers. "
            "Before answering, call every available batch tool exactly once. "
            "The batch tools are independent and expensive, so call them in parallel in the same turn. "
            "After all results return, choose the champion by lowest rmse, breaking ties with mae."
        ),
        model_settings=ModelSettings(tool_choice="required", parallel_tool_calls=True),
        tools=tools,
        output_type=CoordinatorSummary,
    )

    started = time.perf_counter()
    result = await Runner.run(
        coordinator,
        (
            "Run the full SARIMA batch search now. Use all batch tools exactly once, in parallel, "
            "then report the winning candidate."
        ),
    )
    wall_time_seconds = time.perf_counter() - started

    batch_results = [collected_results[str(batch["batch_name"])] for batch in selected_batches]
    total_batch_duration_seconds = sum(item.batch_duration_seconds or 0.0 for item in batch_results)
    total_tool_invocation_seconds = sum(collected_tool_durations.values())
    tool_call_count = sum(
        1 for item in result.new_items if getattr(item, "type", None) == "tool_call_item"
    )
    likely_parallel = len(batch_results) > 1 and wall_time_seconds < (
        total_tool_invocation_seconds * 0.8
    )

    return AgentParallelExecutionReport(
        final_output=result.final_output,
        wall_time_seconds=wall_time_seconds,
        total_batch_duration_seconds=total_batch_duration_seconds,
        total_tool_invocation_seconds=total_tool_invocation_seconds,
        likely_parallel=likely_parallel,
        tool_call_count=tool_call_count,
        tool_invocation_durations=collected_tool_durations,
        batch_results=batch_results,
    )


async def _async_main(args: argparse.Namespace) -> None:
    require_credentials()
    batch_specs = build_candidate_batches(
        batch_limit=args.batch_limit,
        sleep_seconds=args.sleep_seconds,
    )
    sandbox_type = E2BSandboxType(args.sandbox_type)
    if args.execution_mode == "python":
        batch_results = await run_parallel_grid_search(
            batch_specs=batch_specs,
            model=args.model,
            sandbox_type=sandbox_type,
            template=args.template,
            timeout_seconds=args.timeout,
            max_concurrency=args.max_concurrency,
        )
        ranked = ranked_rows(batch_results)
        print(
            json.dumps(
                {"batch_results": [item.model_dump(mode="json") for item in batch_results]},
                indent=2,
            )
        )
        if ranked:
            print("\nChampion")
            print(json.dumps(ranked[0], indent=2, default=str))
        return

    report = await run_agent_parallel_grid_search(
        batch_specs=batch_specs,
        model=args.model,
        sandbox_type=sandbox_type,
        template=args.template,
        timeout_seconds=args.timeout,
    )
    print(json.dumps(report.model_dump(mode="json"), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a parallel SARIMA grid search across E2B sandboxes."
    )
    parser.add_argument(
        "--execution-mode",
        default="python",
        choices=["python", "agent"],
        help="Use deterministic Python fan-out or let a coordinator agent invoke batch tools.",
    )
    parser.add_argument("--model", default=os.getenv("OPENAI_MODEL", DEFAULT_MODEL))
    parser.add_argument(
        "--sandbox-type",
        default=os.getenv("E2B_SANDBOX_TYPE", E2BSandboxType.E2B.value),
        choices=[member.value for member in E2BSandboxType],
    )
    parser.add_argument("--template", default=os.getenv("E2B_TEMPLATE") or None)
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(os.getenv("E2B_SARIMA_TIMEOUT", str(DEFAULT_TIMEOUT_SECONDS))),
    )
    parser.add_argument(
        "--max-concurrency",
        type=int,
        default=int(os.getenv("E2B_SARIMA_MAX_CONCURRENCY", str(DEFAULT_MAX_CONCURRENCY))),
    )
    parser.add_argument(
        "--batch-limit",
        type=int,
        default=None,
        help="Limit the number of candidate batches for quicker examples.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Add an artificial delay inside each sandbox worker to make parallelism easier to observe.",
    )
    args = parser.parse_args()
    asyncio.run(_async_main(args))


if __name__ == "__main__":
    main()
