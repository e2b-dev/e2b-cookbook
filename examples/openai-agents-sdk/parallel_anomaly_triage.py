from __future__ import annotations

import argparse
import asyncio
import csv
import io
import json
import os
import random
import sys
from datetime import datetime, timedelta
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
DEFAULT_INCIDENT_SEED = 7


class TriageLaneResult(BaseModel):
    lane: str
    hypothesis: str
    confidence: str
    summary: str
    evidence_files: list[str] = Field(min_length=2)


class IncidentSummary(BaseModel):
    likely_root_cause: str
    confidence: str
    ranked_hypotheses: list[str] = Field(min_length=3)
    next_actions: list[str] = Field(min_length=3)
    recommendation: str


LANE_CONFIGS: list[dict[str, str]] = [
    {
        "name": "latency_shift",
        "brief": "Focus on timing shifts in latency, error rate, and queue depth.",
    },
    {
        "name": "dependency_correlation",
        "brief": "Focus on which backend dependency moved in lockstep with the incident.",
    },
    {
        "name": "deploy_timeline",
        "brief": "Focus on the deploy timeline and what changed right before the regression.",
    },
    {
        "name": "log_signature",
        "brief": "Focus on recurring log signatures and the most likely broken subsystem.",
    },
]


def _csv_text(rows: list[list[str]]) -> str:
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerows(rows)
    return stream.getvalue()


def build_incident_bundle(seed: int = DEFAULT_INCIDENT_SEED) -> dict[str, str]:
    random.seed(seed)
    start = datetime(2026, 2, 3, 8, 0, 0)
    rows = [
        [
            "timestamp",
            "requests_per_minute",
            "latency_ms",
            "error_rate",
            "queue_depth",
            "db_cpu",
            "cache_hit_rate",
        ]
    ]
    deploy_rows = [["timestamp", "service", "version", "notes"]]
    log_lines: list[str] = []

    incident_start = start + timedelta(minutes=90)
    for index in range(180):
        timestamp = start + timedelta(minutes=index)
        req = 1140 + int(55 * math_sin(index / 11.0)) + random.randint(-18, 18)
        latency = 165 + 7 * math_sin(index / 13.0) + random.randint(-5, 5)
        error_rate = 0.012 + random.random() * 0.003
        queue_depth = 18 + int(4 * math_sin(index / 17.0)) + random.randint(-2, 2)
        db_cpu = 41 + 3 * math_sin(index / 19.0) + random.randint(-2, 2)
        cache_hit_rate = 0.964 + random.random() * 0.01

        if timestamp >= incident_start:
            latency += 115 + 0.9 * (index - 90)
            error_rate += 0.071 + random.random() * 0.01
            queue_depth += 34 + int((index - 90) * 0.4)
            db_cpu += 6 + random.randint(0, 3)
            cache_hit_rate -= 0.148 + random.random() * 0.012
            if index % 3 == 0:
                log_lines.append(
                    f"{timestamp.isoformat()}Z gateway ERROR upstream cache auth timeout service=edge-cache trace=trk-{index:04d}"
                )
            if index % 5 == 0:
                log_lines.append(
                    f"{timestamp.isoformat()}Z worker WARN retry storm for cache token refresh queue_depth={queue_depth}"
                )
        else:
            if index % 29 == 0:
                log_lines.append(
                    f"{timestamp.isoformat()}Z gateway INFO steady-state request window ok service=edge-cache"
                )

        rows.append(
            [
                timestamp.isoformat() + "Z",
                str(req),
                f"{latency:.2f}",
                f"{error_rate:.4f}",
                str(queue_depth),
                f"{db_cpu:.2f}",
                f"{cache_hit_rate:.4f}",
            ]
        )

    deploy_rows.extend(
        [
            [
                (start + timedelta(minutes=28)).isoformat() + "Z",
                "frontend",
                "2026.02.03.1",
                "copy update",
            ],
            [
                (start + timedelta(minutes=64)).isoformat() + "Z",
                "api",
                "2026.02.03.7",
                "billing fix",
            ],
            [
                (start + timedelta(minutes=88)).isoformat() + "Z",
                "edge-cache",
                "2026.02.03.9",
                "switch token refresh to async background path",
            ],
        ]
    )

    incident_notes = (
        "Incident brief:\n"
        "- Customer-facing latency and errors climbed sharply around 09:30 UTC.\n"
        "- One deploy landed on edge-cache two minutes before the break.\n"
        "- Ops suspects either a dependency problem or a bad auth/token refresh regression.\n"
    )

    return {
        "metrics.csv": _csv_text(rows),
        "deploys.csv": _csv_text(deploy_rows),
        "logs.txt": "\n".join(log_lines) + "\n",
        "incident_brief.txt": incident_notes,
    }


def math_sin(value: float) -> float:
    import math

    return math.sin(value)


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


def _worker_manifest(*, lane_name: str, lane_brief: str, incident_bundle: dict[str, str]) -> Any:
    worker_script = f"""\
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path


def ensure_packages() -> None:
    modules = {{
        "numpy": "numpy",
        "pandas": "pandas",
        "matplotlib": "matplotlib",
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


LANE_NAME = {lane_name!r}


def load_metrics() -> pd.DataFrame:
    frame = pd.read_csv("metrics.csv")
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    return frame


def write_summary(hypothesis: str, confidence: str, summary: str, chart_name: str) -> None:
    artifacts = Path("artifacts")
    artifacts.mkdir(exist_ok=True)
    chart_path = artifacts / chart_name
    summary_path = artifacts / f"{{LANE_NAME}}_summary.md"
    payload_path = artifacts / f"{{LANE_NAME}}_result.json"
    summary_path.write_text(
        "\\n".join(
            [
                f"# {{LANE_NAME}}",
                "",
                f"- hypothesis: {{hypothesis}}",
                f"- confidence: {{confidence}}",
                "",
                summary,
            ]
        )
        + "\\n",
        encoding="utf-8",
    )
    payload_path.write_text(
        json.dumps(
            {{
                "lane": LANE_NAME,
                "hypothesis": hypothesis,
                "confidence": confidence,
                "summary": summary,
                "evidence_files": [chart_path.as_posix(), summary_path.as_posix(), payload_path.as_posix()],
            }},
            indent=2,
        )
        + "\\n",
        encoding="utf-8",
    )


frame = load_metrics()
artifacts = Path("artifacts")
artifacts.mkdir(exist_ok=True)

if LANE_NAME == "latency_shift":
    chart_path = artifacts / "latency_shift_chart.png"
    figure, axes = plt.subplots(2, 1, figsize=(9, 6), sharex=True)
    axes[0].plot(frame["timestamp"], frame["latency_ms"], label="latency")
    axes[0].plot(frame["timestamp"], frame["error_rate"] * 3000.0, label="error rate x3000")
    axes[0].legend()
    axes[0].set_title("Latency and error-rate break")
    axes[1].plot(frame["timestamp"], frame["queue_depth"], label="queue depth", color="#b45309")
    axes[1].legend()
    figure.tight_layout()
    figure.savefig(chart_path)
    plt.close(figure)
    change_index = int(np.argmax(np.diff(frame["latency_ms"].to_numpy(dtype=float))))
    timestamp = str(frame.iloc[change_index + 1]["timestamp"])
    hypothesis = "User-facing latency broke at the same time queue depth accelerated, consistent with a request retry storm."
    summary = f"Sharpest latency jump lands around {{timestamp}} and is followed immediately by sustained queue growth and error-rate expansion."
    write_summary(hypothesis, "high", summary, chart_path.name)
elif LANE_NAME == "dependency_correlation":
    chart_path = artifacts / "dependency_correlation_chart.png"
    figure, axes = plt.subplots(2, 1, figsize=(9, 6), sharex=True)
    axes[0].plot(frame["timestamp"], frame["db_cpu"], label="db cpu")
    axes[0].plot(frame["timestamp"], frame["cache_hit_rate"] * 100.0, label="cache hit rate x100")
    axes[0].legend()
    axes[0].set_title("Dependency movement during incident")
    axes[1].scatter(frame["cache_hit_rate"], frame["latency_ms"], s=10, alpha=0.6)
    axes[1].set_xlabel("cache hit rate")
    axes[1].set_ylabel("latency ms")
    figure.tight_layout()
    figure.savefig(chart_path)
    plt.close(figure)
    hypothesis = "Cache degradation, not database saturation, is the strongest correlated dependency signal."
    summary = "Cache hit rate collapses as latency rises, while database CPU only drifts modestly. The incident looks cache-auth related rather than DB-capacity related."
    write_summary(hypothesis, "high", summary, chart_path.name)
elif LANE_NAME == "deploy_timeline":
    chart_path = artifacts / "deploy_timeline_chart.png"
    deploys = pd.read_csv("deploys.csv")
    deploys["timestamp"] = pd.to_datetime(deploys["timestamp"], utc=True)
    figure, axis = plt.subplots(figsize=(9, 4))
    axis.plot(frame["timestamp"], frame["latency_ms"], label="latency")
    for _, row in deploys.iterrows():
        axis.axvline(row["timestamp"], linestyle="--", alpha=0.6)
        axis.text(row["timestamp"], frame["latency_ms"].max() * 0.95, row["service"], rotation=90, va="top")
    axis.set_title("Latency against deploy timeline")
    axis.legend()
    figure.tight_layout()
    figure.savefig(chart_path)
    plt.close(figure)
    edge_deploy = deploys.loc[deploys["service"] == "edge-cache"].iloc[0]
    hypothesis = "The edge-cache deploy is the highest-probability trigger because it lands immediately before the regression."
    summary = (
        "Frontend and API deploys are well separated from the break. The edge-cache rollout happens just before the incident and its notes mention token refresh changes."
    )
    write_summary(hypothesis, "high", summary, chart_path.name)
elif LANE_NAME == "log_signature":
    chart_path = artifacts / "log_signature_chart.png"
    log_lines = Path("logs.txt").read_text(encoding="utf-8").splitlines()
    signatures = Counter()
    for line in log_lines:
        if "cache auth timeout" in line:
            signatures["cache auth timeout"] += 1
        if "retry storm" in line:
            signatures["retry storm"] += 1
    figure, axis = plt.subplots(figsize=(7, 4))
    axis.bar(list(signatures.keys()), list(signatures.values()), color=["#dc2626", "#f59e0b"])
    axis.set_title("Dominant log signatures")
    figure.tight_layout()
    figure.savefig(chart_path)
    plt.close(figure)
    hypothesis = "Logs point directly at cache token refresh/auth failures causing retry amplification."
    summary = "The dominant log signatures are cache auth timeouts and retry-storm warnings, which align with the edge-cache deploy notes."
    write_summary(hypothesis, "high", summary, chart_path.name)
else:
    raise RuntimeError(f"unsupported lane {{LANE_NAME}}")

print(Path("artifacts", f"{{LANE_NAME}}_result.json").read_text(encoding="utf-8"))
"""

    return text_manifest(
        {
            "README.md": (
                f"Parallel anomaly triage worker.\nLane: {lane_name}\nBrief: {lane_brief}\n"
            ),
            **incident_bundle,
            "triage.py": worker_script,
        }
    )


def _build_lane_agent(
    *,
    model: str,
    manifest: Any,
    lane_name: str,
    lane_brief: str,
) -> SandboxAgent:
    return SandboxAgent(
        name=f"Incident Lane {lane_name}",
        model=model,
        instructions=(
            "Investigate the incident from your assigned lane, run the sandbox script, inspect the "
            "generated evidence, and return a structured hypothesis grounded in the artifacts."
        ),
        developer_instructions=(
            f"Lane name: {lane_name}\n"
            f"Lane brief: {lane_brief}\n"
            "Use the shell tool. Run `python triage.py`. Inspect the generated files in `artifacts/` "
            "before answering. Do not invent evidence files or confidence."
        ),
        default_manifest=manifest,
        capabilities=[WorkspaceShellCapability()],
        model_settings=ModelSettings(tool_choice="required"),
        output_type=TriageLaneResult,
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


async def run_parallel_anomaly_triage(
    *,
    model: str,
    sandbox_type: E2BSandboxType,
    template: str | None,
    timeout_seconds: int,
    incident_seed: int = DEFAULT_INCIDENT_SEED,
    incident_bundle: dict[str, str] | None = None,
    lanes: list[dict[str, str]] | None = None,
    shutdown_sessions: bool = True,
) -> dict[str, Any]:
    selected_lanes = lanes or LANE_CONFIGS
    bundle = incident_bundle or build_incident_bundle(incident_seed)
    sessions: list[Any] = []
    tools: list[Any] = []
    collected_payloads: dict[str, dict[str, Any]] = {}

    try:
        for lane in selected_lanes:
            manifest = _worker_manifest(
                lane_name=lane["name"],
                lane_brief=lane["brief"],
                incident_bundle=bundle,
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
            )
            tools.append(
                lane_agent.as_tool(
                    tool_name=f"investigate_{lane['name']}",
                    tool_description=(
                        f"Run the {lane['name']} incident investigation lane in its own sandbox and "
                        "return the lane hypothesis."
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
            name="Parallel Incident Triage Coordinator",
            model=model,
            instructions=(
                "You coordinate incident triage across independent sandbox lanes. Before answering, "
                "call every lane tool exactly once. These lanes are independent, so call them in "
                "parallel in the same turn. After they return, rank the hypotheses, name the likely "
                "root cause, and propose next actions."
            ),
            model_settings=ModelSettings(tool_choice="required", parallel_tool_calls=True),
            tools=tools,
            output_type=IncidentSummary,
        )

        result = await Runner.run(
            coordinator,
            (
                "Investigate this incident using every lane now. Synthesize the strongest root-cause "
                "readout and propose next actions for the on-call team."
            ),
        )

        lane_results = [
            TriageLaneResult.model_validate(collected_payloads[lane["name"]])
            for lane in selected_lanes
            if lane["name"] in collected_payloads
        ]

        tool_names = [
            tool_call_name(item.raw_item)
            for item in result.new_items
            if getattr(item, "type", None) == "tool_call_item"
        ]

        return {
            "incident_seed": incident_seed,
            "tool_names": tool_names,
            "selection": result.final_output.model_dump(mode="json"),
            "lanes": [lane_result.model_dump(mode="json") for lane_result in lane_results],
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
        description="Run a parallel anomaly triage investigation across E2B sandboxes."
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
    parser.add_argument(
        "--incident-seed",
        type=int,
        default=int(os.getenv("INCIDENT_SEED", str(DEFAULT_INCIDENT_SEED))),
    )
    parser.add_argument(
        "--keep-sandboxes",
        action="store_true",
        help="Leave the worker sandboxes running after the CLI exits.",
    )
    args = parser.parse_args()

    require_credentials()
    payload = asyncio.run(
        run_parallel_anomaly_triage(
            model=args.model,
            sandbox_type=E2BSandboxType(args.sandbox_type),
            template=args.template,
            timeout_seconds=args.timeout,
            incident_seed=args.incident_seed,
            shutdown_sessions=not args.keep_sandboxes,
        )
    )
    print(json.dumps(payload, indent=2))
