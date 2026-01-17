import os
from typing import Any

from e2b_code_interpreter import Sandbox
from langchain_core.tools import tool


class CodeInterpreterTool:
    """
    This class calls arbitrary code against a Python Jupyter notebook.
    It requires an E2B_API_KEY to create a sandbox.
    """

    def __init__(self):
        if "E2B_API_KEY" not in os.environ:
            raise Exception(
                "Code Interpreter tool called while E2B_API_KEY environment variable is not set. "
                "Please get your E2B api key here https://e2b.dev/dashboard?tab=keys and set the E2B_API_KEY environment variable."
            )
        self.sandbox = Sandbox.create()
        self.last_results = []

    def close(self):
        self.sandbox.kill()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def run_code(self, code: str) -> dict[str, Any]:
        """Execute Python code in a Jupyter notebook cell."""
        print(f"***Code Interpreting...\n{code}\n====")
        execution = self.sandbox.run_code(code)
        self.last_results = execution.results
        return {
            "results": execution.results,
            "stdout": execution.logs.stdout,
            "stderr": execution.logs.stderr,
            "error": execution.error,
        }


def create_code_interpreter_tool(interpreter: CodeInterpreterTool):
    """Create a LangChain tool from the code interpreter."""

    @tool
    def code_interpreter(code: str) -> dict[str, Any]:
        """Execute python code in a Jupyter notebook cell and returns any rich data (eg charts), stdout, stderr, and error."""
        return interpreter.run_code(code)

    return code_interpreter
