import os
from dotenv import load_dotenv
from e2b import Sandbox
import openai
import time
from ai_github_developer.actions import (
    create_directory,
    read_file,
    save_content_to_file,
    list_files,
    commit,
    make_pull_request,
    REPO_DIRECTORY,
)

from rich import print
from rich.console import Console
from rich.theme import Theme
from rich.prompt import Prompt

class MyPrompt(Prompt):
    prompt_suffix = ""


custom_theme = Theme(
    {
        "theme": "bold #666666",
    }
)
console = Console(theme=custom_theme)


load_dotenv()
client = openai.Client()

AI_ASSISTANT_ID = os.getenv("AI_ASSISTANT_ID")
USER_GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

assistant = client.beta.assistants.retrieve(AI_ASSISTANT_ID)


def prompt_user_for_github_repo():
    global user_repo
    user_repo = MyPrompt.ask(
        "\nWhat GitHub repo do you want to work in? Specify it like this: [bold #E0E0E0]your_username/your_repo_name[/bold #E0E0E0].\n> "
    )
    print("\n🔄[#666666] Cloning the repo...[/#666666]", end="\n")
    print("", end="\n")

    repo_url = f"https://github.com/{user_repo.strip()}.git"

    return repo_url


def prompt_user_for_task(repo_url):
    user_task_specification = MyPrompt.ask(
        "\n\n🤖[#E57B00][bold] The AI developer is working in the cloned repo[/bold][/#E57B00]\n\nWhat do you want to do?\n> "
    )
    user_task = (
        f"Please work with the codebase repo called {repo_url} "
        f"that is cloned in the /home/user/repo directory. React on the following user's comment: {user_task_specification}"
    )
    print("", end="\n")
    return user_task


def prompt_user_for_auth():
    user_auth = MyPrompt.ask(
        "\nProvide [bold]GitHub token[/bold] with following permissions:\n\n\u2022 read:org\n\u2022 read:project\n\u2022 repo\n\nFind or create your token at [bold #0096FF]https://github.com/settings/tokens[/bold #0096FF]\n\nToken:",
        password=True,
    )
    print("", end="\n")
    return user_auth


def setup_git(sandbox):
    print("Logging into GitHub...")
    # Identify AI developer in git
    sandbox.process.start_and_wait(
        "git config --global user.email 'ai-developer@email.com'"
    )
    sandbox.process.start_and_wait("git config --global user.name 'AI Developer'")

    # Login user to GitHub
    proc = sandbox.process.start_and_wait(
        f"echo {USER_GITHUB_TOKEN} | gh auth login --with-token"
    )
    if proc.exit_code != 0:
        print("[bold #FF0000][Sandbox] [/bold #FF0000]Error: Unable to log into GitHub", end="\n")
        print(proc.stderr)
        print(proc.stdout)
        exit(1)

    # Setup user's Git credentials
    proc = sandbox.process.start_and_wait("gh auth setup-git")
    if proc.exit_code != 0:
        print("[bold #FF0000][Sandbox] [/bold #FF0000]Error: Unable to set up Git auth with GitHub")
        print(proc.stderr)
        print(proc.stdout)
        exit(1)
    else:
        print("\n✅ [#666666]Logged in[/#666666]")


def clone_repo_in_sandbox(sandbox, repo_url):
    # Clone the repo
    git_clone_proc = sandbox.process.start_and_wait(
        f"git clone {repo_url} {REPO_DIRECTORY}"
    )
    if git_clone_proc.exit_code != 0:
        print("[bold #FF0000][Sandbox] [/bold #FF0000]Error: Unable to clone the repo")
        exit(1)


def handle_sandbox_stdout(message):
    console.print(f"[theme][Sandbox][/theme] {message.line}")


def handle_sandbox_stderr(message):
    console.print(f"[theme][Sandbox][/theme] {message.line}")


def main():
    global USER_GITHUB_TOKEN

    # Create the E2B sandbox
    sandbox = Sandbox(
        on_stderr=handle_sandbox_stderr,
        on_stdout=handle_sandbox_stdout,
    )
    sandbox.add_action(create_directory).add_action(read_file).add_action(
        save_content_to_file
    ).add_action(list_files).add_action(commit).add_action(make_pull_request)

    print("\n🤖[#E57B00][bold] AI developer[/#E57B00][/bold]")
    if USER_GITHUB_TOKEN is None:
        USER_GITHUB_TOKEN = prompt_user_for_auth()
    else:
        print("\n✅ [#666666]GitHub token loaded[/#666666]\n")

    # Setup git right away so user knows immediatelly if they passed wrong token
    setup_git(sandbox)

    # Clone repo
    repo_url = prompt_user_for_github_repo()
    clone_repo_in_sandbox(sandbox, repo_url)

    while True:
        user_task = prompt_user_for_task(repo_url)

        thread = client.beta.threads.create(
            messages=[
                {
                    "role": "user",
                    "content": f"Carefully plan this task and start working on it: {user_task} in the {repo_url} repo",
                },
            ],
        )

        run = client.beta.threads.runs.create(
            thread_id=thread.id, assistant_id=assistant.id
        )

        spinner = ""
        with console.status(spinner):
            previous_status = None
            while True:
                if run.status != previous_status:
                    console.print(
                        f"[bold #FF8800]>[/bold #FF8800] Assistant is currently in status: {run.status} [#666666](waiting for OpenAI)[/#666666]"
                    )
                    previous_status = run.status
                if run.status == "requires_action":
                    outputs = sandbox.openai.actions.run(run)
                    if len(outputs) > 0:
                        client.beta.threads.runs.submit_tool_outputs(
                            thread_id=thread.id, run_id=run.id, tool_outputs=outputs
                        )
                elif run.status == "completed":
                    console.print("\n✅[#666666] Run completed[/#666666]")
                    messages = (
                        client.beta.threads.messages.list(thread_id=thread.id)
                        .data[0]
                        .content
                    )
                    text_messages = [
                        message for message in messages if message.type == "text"
                    ]
                    console.print("Thread finished:", text_messages[0].text.value)
                    break

                elif run.status in ["queued", "in_progress"]:
                    pass

                elif run.status in ["cancelled", "cancelling", "expired", "failed"]:
                    break

                else:
                    print(f"Unknown status: {run.status}")
                    break

                run = client.beta.threads.runs.retrieve(
                    thread_id=thread.id, run_id=run.id
                )
                time.sleep(0.5)


if __name__ == "__main__":
    main()
