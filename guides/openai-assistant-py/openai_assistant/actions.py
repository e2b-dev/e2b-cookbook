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


def write_to_file(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    filename = args["filename"]
    content = args["content"]

    try:
        dir = os.path.dirname(filename)

        sandbox.filesystem.make_dir(dir)
        sandbox.filesystem.write(filename, content)

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


def commit_and_push(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    repo_directory = (
        "/home/user/repo"  # Assuming the repository is cloned to this directory
    )
    commit_message = args["commit_message"]

    git_add_proc = sandbox.process.start_and_wait(f"git -C {repo_directory} add .")
    if git_add_proc.stderr != "":
        return git_add_proc.stderr

    git_commit_proc = sandbox.process.start_and_wait(
        f"git -C {repo_directory} commit -m '{commit_message}'"
    )
    if git_commit_proc.stderr != "":
        return git_commit_proc.stderr

    git_push_proc = sandbox.process.start_and_wait(
        f"git -C {repo_directory} push -u origin"
    )  # Adjust 'main' to your branch name if different
    if git_push_proc.stderr != "":
        return git_push_proc.stderr

    return "success"
