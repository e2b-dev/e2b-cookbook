import os

from typing import Any, Dict
from e2b import Sandbox


def save_code_to_file(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    filename = args["filename"]
    code = args["code"]

    try:
        dir = os.path.dirname(filename)

        sandbox.filesystem.make_dir(dir)
        sandbox.filesystem.write(filename, code)

        return "success"
    except Exception as e:
        return f"Error: {e}"


def list_files(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    path = args["path"]

    try:
        files = sandbox.filesystem.list(path)
        response = "\n".join(
            [f"dir: {file.name}" if file.is_dir else file.name for file in files]
        )
        return response
    except Exception as e:
        return f"Error: {e}"


def read_file(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    path = args["path"]

    try:
        return sandbox.filesystem.read(path)
    except Exception as e:
        return f"Error: {e}"
