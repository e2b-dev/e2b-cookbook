import os
from typing import Any, Dict
from e2b import Sandbox
from rich.console import Console
from rich.theme import Theme

# Create a Rich Console instance with your desired colors
custom_theme = Theme(
    {
        "sandbox_action": "bold #E57B00",  # Adjust color as needed
    }
)

console = Console(theme=custom_theme)


def create_directory(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    directory = args["directory"]
    console.print(
        f"[sandbox_action][Sandbox Action]\t[/sandbox_action] Creating directory: {directory}"
    )

    try:
        sandbox.filesystem.make_dir(directory)
        return "success"
    except Exception as e:
        return f"Error: {e}"


def save_content_to_file(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    filename = args["filename"]
    content = args["content"]
    console.print(
        f"[sandbox_action][Sandbox Action]\t[/sandbox_action] Saving content to {filename}"
    )

    try:
        dir = os.path.dirname(filename)
        sandbox.filesystem.make_dir(dir)
        sandbox.filesystem.write(filename, content)
        return "success"
    except Exception as e:
        return f"Error: {e}"
    

def list_files(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    path = args["path"]
    console.print(
        f"[sandbox_action][Sandbox Action]\t[/sandbox_action] Listing files on path {path}"
    )

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
    console.print(
        f"[sandbox_action][Sandbox Action]\t[/sandbox_action] Reading file on path {path}"
    )

    try:
        return sandbox.filesystem.read(path)
    except Exception as e:
        return f"Error: {e}"


def commit_and_push(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    repo_directory = (
        "/home/user/repo"  # The repository is cloned to this directory
    )
    commit_message = args["commit_message"]
    console.print(
        f"[sandbox_action][Sandbox Action]\t[/sandbox_action] Committing with the message '{commit_message}'"
    )

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

def make_pull_request(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    repo_directory = "/home/user/repo"  # The repository is cloned to this directory
    base_branch = "main"  # The base branch is always the existing main branch
    new_branch = "ai-developer"  # The new branch has a constant path (e.g., AI_developer)
    title = "Pull request from AI Developer"  # The title of the pull request
    body = ""  # The description or body of the pull request is empty

    console.print(
        f"[sandbox_action][Sandbox Action]\t[/sandbox_action] Making a pull request from '{new_branch}' to '{base_branch}'"
    )

    # Step 1: Create a new branch
    git_checkout_proc = sandbox.process.start_and_wait(
        f"git -C {repo_directory} checkout -b {new_branch}"
    )
    if git_checkout_proc.stderr != "":
        return git_checkout_proc.stderr

    # Step 2: Add, commit, and push the changes to the new branch
    git_add_proc = sandbox.process.start_and_wait(f"git -C {repo_directory} add .")
    if git_add_proc.stderr != "":
        return git_add_proc.stderr

    git_commit_proc = sandbox.process.start_and_wait(
        f"git -C {repo_directory} commit -m 'Commit message for pull request'"
    )
    if git_commit_proc.stderr != "":
        return git_commit_proc.stderr

    git_push_proc = sandbox.process.start_and_wait(
        f"git -C {repo_directory} push -u origin {new_branch}"
    )
    if git_push_proc.stderr != "":
        return git_push_proc.stderr

    # Step 3: Create the pull request
    gh_pull_request_proc = sandbox.process.start_and_wait(
        f"gh pr create --base {base_branch} --head {new_branch} --title '{title}' --body '{body}'"
    )
    if gh_pull_request_proc.stderr != "":
        return gh_pull_request_proc.stderr

    return "success"