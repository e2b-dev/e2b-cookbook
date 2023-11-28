import os
import e2b
import openai
from e2b import Sandbox
from typing import Any, Dict # Optional - import types, allowing for explicit type hints
from dotenv import load_dotenv

load_dotenv()
openai.api_key = os.environ["OPENAI_API_KEY"]

#spawn E2B sandbox
client = openai.Client()
sandbox = Sandbox()


# Define assistant's actions
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
    
