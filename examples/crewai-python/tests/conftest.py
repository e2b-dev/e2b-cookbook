from __future__ import annotations

import tempfile
from pathlib import Path

from crewai_core.token_manager import TokenManager


def test_credentials_path() -> Path:
    path = Path(tempfile.gettempdir()) / "crewai-python-test-credentials"
    path.mkdir(parents=True, exist_ok=True)
    return path


# CrewAI initializes its credential manager during import. Keep that test-only
# state out of the developer's user application directory.
TokenManager._get_secure_storage_path = staticmethod(test_credentials_path)
