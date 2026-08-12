from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import urllib.parse
import urllib.request
from typing import Any

from pydantic import BaseModel, Field

from agents import Agent, ModelSettings, Runner
from agents.run import RunConfig
from agents.sandbox import SandboxAgent, SandboxRunConfig

if __package__ is None or __package__ == "":
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from agents.extensions.sandbox import E2BSandboxClient, E2BSandboxClientOptions, E2BSandboxType
from examples.sandbox.misc.example_support import text_manifest, tool_call_name
from examples.sandbox.misc.workspace_shell import WorkspaceShellCapability

DEFAULT_MODEL = "gpt-5.6-luna"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_SERIES_ID = "PAYEMS"
DEFAULT_HORIZON = 12


class ForecastLaneResult(BaseModel):
    lane: str
    model_family: str
    summary: str
    rmse: float
    mae: float
    mape: float
    evidence_files: list[str] = Field(min_length=2)


class ForecastChampion(BaseModel):
    winner_lane: str
    winner_model_family: str
    ranked_lanes: list[str] = Field(min_length=3)
    recommendation: str


LANE_CONFIGS: list[dict[str, str]] = [
    {
        "name": "seasonal_naive",
        "model_family": "Seasonal Naive",
        "brief": "Reuse the same month from the prior year as the default forecast.",
    },
    {
        "name": "trend_seasonal",
        "model_family": "Trend + Seasonal Means",
        "brief": "Fit a linear trend and monthly seasonal offsets for a fast interpretable baseline.",
    },
    {
        "name": "ets",
        "model_family": "ETS",
        "brief": "Use additive Holt-Winters exponential smoothing with yearly seasonality.",
    },
    {
        "name": "sarima",
        "model_family": "SARIMA",
        "brief": "Use a single strong seasonal ARIMA configuration for a heavier benchmark.",
    },
]


def fetch_fred_series_csv(
    *,
    series_id: str = DEFAULT_SERIES_ID,
    min_observations: int = 72,
) -> tuple[str, dict[str, Any]]:
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?" + urllib.parse.urlencode(
        {"id": series_id}
    )
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = response.read().decode("utf-8")

    rows = payload.splitlines()
    expected_header = f"observation_date,{series_id}"
    if not rows or rows[0].strip() not in {"DATE,VALUE", expected_header}:
        raise RuntimeError(f"Unexpected FRED response for {series_id}: {rows[:2]}")

    cleaned_rows = ["date,value"]
    last_date = ""
    for raw_row in rows[1:]:
        if not raw_row.strip():
            continue
        date_text, value_text = raw_row.split(",", 1)
        if value_text.strip() == ".":
            continue
        cleaned_rows.append(f"{date_text},{value_text.strip()}")
        last_date = date_text

    observation_count = len(cleaned_rows) - 1
    if observation_count < min_observations:
        raise RuntimeError(
            f"Series {series_id} only returned {observation_count} observations; need at least {min_observations}."
        )

    return "\n".join(cleaned_rows) + "\n", {
        "series_id": series_id,
        "source_url": url,
        "observation_count": observation_count,
        "last_date": last_date,
    }


def _run_config(
    *,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    session: Any | None = None,
) -> RunConfig:
    return RunConfig(
        sandbox=SandboxRunConfig(
            client=None if session is not None else E2BSandboxClient(),
            session=session,
            options=None
            if session is not None
            else E2BSandboxClientOptions(
                sandbox_type=sandbox_type,
                template=template,
                timeout=timeout_seconds,
                allow_internet_access=True,
                pause_on_exit=True,
            ),
        )
    )


def _worker_manifest(
    *,
    lane_name: str,
    lane_brief: str,
    series_csv: str,
    metadata: dict[str, Any],
    horizon: int,
) -> Any:
    worker_script = f"""\
import json
import math
import subprocess
import sys
from pathlib import Path


def ensure_packages() -> None:
    modules = {{
        "numpy": "numpy",
        "pandas": "pandas",
        "matplotlib": "matplotlib",
        "statsmodels": "statsmodels",
    }}
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
from statsmodels.tsa.api import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX


LANE_NAME = {lane_name!r}
MODEL_FAMILY = {next(config["model_family"] for config in LANE_CONFIGS if config["name"] == lane_name)!r}
HORIZON = {horizon}


def load_series() -> pd.Series:
    frame = pd.read_csv("series.csv")
    frame["date"] = pd.to_datetime(frame["date"])
    frame = frame.sort_values("date")
    values = pd.to_numeric(frame["value"], errors="coerce").dropna()
    frame = frame.loc[values.index].copy()
    series = pd.Series(frame["value"].astype(float).to_numpy(), index=frame["date"])
    series.index.freq = "MS"
    return series


def seasonal_naive(train: pd.Series, test: pd.Series) -> np.ndarray:
    seasonal_period = 12
    values = train.to_numpy(dtype=float)
    if len(values) < seasonal_period:
        return np.repeat(values[-1], len(test))
    forecasts = []
    for step in range(len(test)):
        forecasts.append(values[len(values) - seasonal_period + (step % seasonal_period)])
    return np.asarray(forecasts, dtype=float)


def trend_seasonal(train: pd.Series, test: pd.Series) -> np.ndarray:
    index = np.arange(len(train), dtype=float)
    slope, intercept = np.polyfit(index, train.to_numpy(dtype=float), 1)
    detrended = train.to_numpy(dtype=float) - (intercept + slope * index)
    month_offsets = {{}}
    for month in range(1, 13):
        mask = train.index.month == month
        month_offsets[month] = float(np.mean(detrended[mask])) if mask.any() else 0.0
    forecasts = []
    for step, timestamp in enumerate(test.index):
        absolute_index = len(train) + step
        trend_value = intercept + slope * absolute_index
        forecasts.append(trend_value + month_offsets[int(timestamp.month)])
    return np.asarray(forecasts, dtype=float)


def ets_forecast(train: pd.Series, test: pd.Series) -> np.ndarray:
    fitted = ExponentialSmoothing(
        train,
        trend="add",
        seasonal="add",
        seasonal_periods=12,
        initialization_method="estimated",
    ).fit(optimized=True)
    return np.asarray(fitted.forecast(len(test)), dtype=float)


def sarima_forecast(train: pd.Series, test: pd.Series) -> np.ndarray:
    fitted = SARIMAX(
        train,
        order=(1, 1, 1),
        seasonal_order=(1, 1, 1, 12),
        enforce_stationarity=False,
        enforce_invertibility=False,
    ).fit(disp=False)
    return np.asarray(fitted.forecast(len(test)), dtype=float)


def run_lane(train: pd.Series, test: pd.Series) -> np.ndarray:
    if LANE_NAME == "seasonal_naive":
        return seasonal_naive(train, test)
    if LANE_NAME == "trend_seasonal":
        return trend_seasonal(train, test)
    if LANE_NAME == "ets":
        return ets_forecast(train, test)
    if LANE_NAME == "sarima":
        return sarima_forecast(train, test)
    raise RuntimeError(f"unsupported lane: {{LANE_NAME}}")


def compute_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    errors = actual - predicted
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    mae = float(np.mean(np.abs(errors)))
    safe_actual = np.where(np.abs(actual) < 1e-9, 1e-9, actual)
    mape = float(np.mean(np.abs(errors) / np.abs(safe_actual)) * 100.0)
    return {{"rmse": rmse, "mae": mae, "mape": mape}}


series = load_series()
train = series.iloc[:-HORIZON]
test = series.iloc[-HORIZON:]
predicted = run_lane(train, test)
actual = test.to_numpy(dtype=float)
metrics = compute_metrics(actual, predicted)

artifacts = Path("artifacts")
artifacts.mkdir(exist_ok=True)
forecast_path = artifacts / f"{{LANE_NAME}}_forecast.png"
summary_path = artifacts / f"{{LANE_NAME}}_summary.md"
json_path = artifacts / f"{{LANE_NAME}}_metrics.json"

figure, axis = plt.subplots(figsize=(8, 4))
axis.plot(train.index, train.to_numpy(dtype=float), label="train", linewidth=2)
axis.plot(test.index, actual, label="actual", linewidth=2)
axis.plot(test.index, predicted, label="forecast", linewidth=2)
axis.set_title(f"{{MODEL_FAMILY}} on {{LANE_NAME}}")
axis.legend()
figure.tight_layout()
figure.savefig(forecast_path)
plt.close(figure)

summary_lines = [
    f"# {{MODEL_FAMILY}}",
    "",
    f"- lane: {{LANE_NAME}}",
    f"- rmse: {{metrics['rmse']:.3f}}",
    f"- mae: {{metrics['mae']:.3f}}",
    f"- mape: {{metrics['mape']:.2f}}%",
]
summary_path.write_text("\\n".join(summary_lines) + "\\n", encoding="utf-8")
json_path.write_text(
    json.dumps(
        {{
            "lane": LANE_NAME,
            "model_family": MODEL_FAMILY,
            **metrics,
            "evidence_files": [forecast_path.as_posix(), summary_path.as_posix(), json_path.as_posix()],
        }},
        indent=2,
    )
    + "\\n",
    encoding="utf-8",
)
print(json.dumps({{"ok": True, "lane": LANE_NAME, "metrics": metrics}}, indent=2))
"""

    return text_manifest(
        {
            "README.md": (
                "Forecast bakeoff worker sandbox.\n"
                f"Series: {metadata['series_id']}\n"
                f"Lane: {lane_name}\n"
                f"Brief: {lane_brief}\n"
                f"Horizon: {horizon}\n"
            ),
            "series.csv": series_csv,
            "analysis.py": worker_script,
        }
    )


def _build_lane_agent(
    *,
    model: str,
    manifest: Any,
    lane_name: str,
    lane_brief: str,
    horizon: int,
    series_id: str,
) -> SandboxAgent:
    return SandboxAgent(
        name=f"Forecast Lane {lane_name}",
        model=model,
        instructions=(
            "Run the forecast lane in the sandbox, inspect the generated artifacts, and return a "
            "structured summary grounded in the metrics and files that were actually produced."
        ),
        developer_instructions=(
            f"Series id: {series_id}\n"
            f"Lane name: {lane_name}\n"
            f"Lane brief: {lane_brief}\n"
            f"Horizon: {horizon}\n"
            "Use the shell tool. Run `python analysis.py`. Inspect the generated files in `artifacts/` "
            "before answering. Do not invent metrics or evidence files."
        ),
        default_manifest=manifest,
        capabilities=[WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
        output_type=ForecastLaneResult,
    )


async def _json_output(result: Any) -> str:
    final_output = result.final_output
    if isinstance(final_output, BaseModel):
        return json.dumps(final_output.model_dump(mode="json"), sort_keys=True)
    return str(final_output)


def _make_output_extractor(collected_payloads: dict[str, dict[str, Any]]):
    async def _extract(result: Any) -> str:
        output = await _json_output(result)
        payload = json.loads(output)
        collected_payloads[str(payload["lane"])] = payload
        return output

    return _extract


async def run_forecast_model_bakeoff(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    series_id: str = DEFAULT_SERIES_ID,
    horizon: int = DEFAULT_HORIZON,
    lanes: list[dict[str, str]] | None = None,
    shutdown_sessions: bool = True,
) -> dict[str, Any]:
    selected_lanes = lanes or LANE_CONFIGS
    series_csv, metadata = await asyncio.to_thread(fetch_fred_series_csv, series_id=series_id)
    sessions: list[Any] = []
    tools: list[Any] = []
    collected_payloads: dict[str, dict[str, Any]] = {}

    try:
        for lane in selected_lanes:
            manifest = _worker_manifest(
                lane_name=lane["name"],
                lane_brief=lane["brief"],
                series_csv=series_csv,
                metadata=metadata,
                horizon=horizon,
            )
            session = await E2BSandboxClient().create(
                manifest=manifest,
                options=E2BSandboxClientOptions(
                    sandbox_type=sandbox_type,
                    template=template,
                    timeout=timeout_seconds,
                    allow_internet_access=True,
                    pause_on_exit=True,
                ),
            )
            await session.start()
            sessions.append(session)

            lane_agent = _build_lane_agent(
                model=model,
                manifest=manifest,
                lane_name=lane["name"],
                lane_brief=lane["brief"],
                horizon=horizon,
                series_id=metadata["series_id"],
            )
            tools.append(
                lane_agent.as_tool(
                    tool_name=f"run_{lane['name']}_forecast_lane",
                    tool_description=(
                        f"Run the {lane['model_family']} forecast lane in its own sandbox and "
                        "return metrics plus evidence files."
                    ),
                    custom_output_extractor=_make_output_extractor(collected_payloads),
                    run_config=_run_config(
                        sandbox_type=sandbox_type,
                        template=template,
                        timeout_seconds=timeout_seconds,
                        session=session,
                    ),
                )
            )

        coordinator = Agent(
            name="Forecast Bakeoff Coordinator",
            model=model,
            instructions=(
                "You coordinate a forecast model bakeoff. Before answering, call every lane tool "
                "exactly once. The lanes are independent, so call them in parallel in the same "
                "turn. After all metrics return, rank the lanes and recommend the most useful "
                "model family for the supplied time series."
            ),
            model_settings=ModelSettings(tool_choice="required", parallel_tool_calls=True),
            tools=tools,
            output_type=ForecastChampion,
        )

        result = await Runner.run(
            coordinator,
            (
                f"Run a forecast bakeoff for FRED series {metadata['series_id']} with a holdout of {horizon} "
                "observations. Use all lanes now and choose the strongest default model."
            ),
        )

        lane_results = [
            ForecastLaneResult.model_validate(collected_payloads[lane["name"]])
            for lane in selected_lanes
            if lane["name"] in collected_payloads
        ]
        leaderboard = sorted(
            [lane_result.model_dump(mode="json") for lane_result in lane_results],
            key=lambda row: (row["rmse"], row["mae"], row["mape"]),
        )

        tool_names = [
            tool_call_name(item.raw_item)
            for item in result.new_items
            if getattr(item, "type", None) == "tool_call_item"
        ]

        return {
            "series": metadata,
            "horizon": horizon,
            "tool_names": tool_names,
            "selection": result.final_output.model_dump(mode="json"),
            "leaderboard": leaderboard,
            "sandboxes": [
                {"lane": lane["name"], "sandbox_id": getattr(session, "sandbox_id", None)}
                for lane, session in zip(selected_lanes, sessions, strict=False)
            ],
            "sandboxes_left_running": not shutdown_sessions,
        }
    finally:
        if shutdown_sessions:
            for session in sessions:
                try:
                    await session.shutdown()
                except Exception:
                    pass


def require_credentials() -> None:
    missing = [name for name in ("OPENAI_API_KEY", "E2B_API_KEY") if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run a parallel forecast model bakeoff across E2B sandboxes."
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
        help="Model to use for the coordinator and lane agents.",
    )
    parser.add_argument(
        "--sandbox-type",
        default=os.getenv("E2B_SANDBOX_TYPE", E2BSandboxType.E2B.value),
        choices=[member.value for member in E2BSandboxType],
    )
    parser.add_argument("--template", default=os.getenv("E2B_TEMPLATE") or None)
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(os.getenv("E2B_TIMEOUT", str(DEFAULT_TIMEOUT_SECONDS))),
    )
    parser.add_argument("--series-id", default=os.getenv("FRED_SERIES_ID", DEFAULT_SERIES_ID))
    parser.add_argument(
        "--horizon",
        type=int,
        default=int(os.getenv("FORECAST_HORIZON", str(DEFAULT_HORIZON))),
    )
    parser.add_argument(
        "--keep-sandboxes",
        action="store_true",
        help="Leave the worker sandboxes running after the CLI exits.",
    )
    args = parser.parse_args()

    require_credentials()
    payload = asyncio.run(
        run_forecast_model_bakeoff(
            model=args.model,
            sandbox_type=E2BSandboxType(args.sandbox_type),
            template=args.template,
            timeout_seconds=args.timeout,
            series_id=args.series_id,
            horizon=args.horizon,
            shutdown_sessions=not args.keep_sandboxes,
        )
    )
    print(json.dumps(payload, indent=2))
