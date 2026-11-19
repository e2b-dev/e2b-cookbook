"""Loopback server: the key stays on this host, outside the episode sandbox."""

import os

from dotenv import load_dotenv
from openenv.core.env_server.http_server import create_app
from openenv.core.env_server.mcp_types import CallToolAction, CallToolObservation
from openenv.core.env_server.types import Observation
from terminus_env.server.terminus_env_environment import TerminusEnvironment

load_dotenv()
os.environ["ENABLE_WEB_INTERFACE"] = "false"
app = create_app(
    TerminusEnvironment,
    CallToolAction,
    CallToolObservation,
    reset_observation_cls=Observation,
    max_concurrent_envs=2,
)
