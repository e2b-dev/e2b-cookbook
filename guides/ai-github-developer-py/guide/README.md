# AI GitHub Developer

## Python guide with complete code

![Gif example](assets/run_example.gif)

**We are [E2B](https://e2b.dev/?ref=cookbook-ai-github-developer). We are building a cloud runtime for AI agents. Try our [Custom Sandboxes](https://e2b.dev/docs/sandbox/templates/overview?ref=cookbook-ai-github-developer) and support us on [GitHub](https://github.com/e2b-dev/e2b?ref=cookbook-ai-github-developer) with a star if you like it. E2B sandboxes work with any LLM - we also support the new Assistants API.**

> 🏁 **Final code:** [E2B Cookbook - AI GitHub Developer](https://github.com/e2b-dev/e2b-cookbook/tree/main/guides/ai-github-developer-py?ref=cookbook-ai-github-developer)

## What we will do

In this guide, we build a custom AI developer that clones a GitHub repository of your choice to its remote cloud environment, works on it, and then makes a pull request with the changes.

We use E2B Sandboxes for the remote execution of AI developer's actions, and the OpenAI's Assistants API for the AI assistant.

> Find the complete final code [here](https://github.com/e2b-dev/e2b-cookbook/tree/main/guides/ai-github-developer-py?ref=cookbook-ai-github-developer). 🏁
> 
> [Here](https://github.com/tizkovatereza/tt-app?ref=cookbook-ai-github-developer) is an example of a Next.js project  that the AI developer built.

![Cover pic](https://ntjfcwpzsxugrykskdgi.supabase.co/storage/v1/object/public/content-assets/AI_GitHub_Developer_v04.png?t=2023-12-20T14%3A27%3A03.702Z)

### Prerequisites

We are using two key concepts:
1. **OpenAI API** - Find your API key [here](https://platform.openai.com/api-keys), read the intro to the [Assistants API](https://platform.openai.com/docs/assistants/how-it-works), and [Function Calling](https://platform.openai.com/docs/guides/function-calling).
2. **E2B Sandbox** - Find your free API key [here](https://e2b.dev/docs/getting-started/api-key?ref=cookbook-ai-github-developer), read how E2B sandboxes work [here](https://e2b.dev/docs/sandbox/overview?ref=cookbook-ai-github-developer).

![E2B API Key screenshot](https://ntjfcwpzsxugrykskdgi.supabase.co/storage/v1/object/public/content-assets/002.png?t=2023-12-19T18%3A23%3A46.378Z)

## 1. Create files

Let's start with creating files:

- [`main.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/main.py?ref=cookbook-ai-github-developer) for the main program
- [`assistant.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/assistant.py?ref=cookbook-ai-github-developer) for defining AI developer's behavior
- [`actions.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/actions.py?ref=cookbook-ai-github-developer) for defining actions (Python functions) for the developer.
  
Prepare also `.env` file where you store your API keys.

## 2. Define actions for the assistant

In the [`actions.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/actions.py?ref=cookbook-ai-github-developer) file, we define Python functions as runnable actions for the AI assistant and the LLM.

First, let's import the E2B Sandbox and everything else we need.

> Here we are using the "default" E2B sandbox. For different use cases, we could use different custom sandboxes with extra packages. For example, a code interpreter sandbox useful for advanced data analysis, or a cloud browser sandbox.

### 2.1 Import packages

We use Python [`Rich` library](https://github.com/Textualize/rich) for formatting the terminal output of the program.

```python
import os
import random
import string
from typing import Any, Dict
from e2b import Sandbox
from rich.console import Console
from rich.theme import Theme
```
### 2.2 Print sandbox actions

We determine the directory where the AI developer will clone the user's repo in the sandbox. We add a way to print what is going on in the sandbox (and pick a theme for the prints, using `Rich`).

```python
REPO_DIRECTORY = "/home/user/repo"

custom_theme = Theme(
    {
        "sandbox_action": "bold #E57B00",  # Adjust color as needed
    }
)

console = Console(theme=custom_theme)


def print_sandbox_action(action_type: str, action_message: str):
    console.print(
        f"[sandbox_action] [Sandbox Action][/sandbox_action] {action_type}: {action_message}"
    )
```
### 2.3 Specify actions for AI developer

Then we define actions that the AI developer can use. You can later modify the program by adding more actions for your specific use case in the same principle. We are adding actions that allow the AI developer the following:

1. Create a directory in the remote sandbox
2. Save content (e.g., code) to a file
3. List files in a directory
4. Read content of files
5. Commit changes
6. Make a pull request


> "Actions" are Python functions automatically called in the program by E2B SDK. Inside the actions
> Each action corresponds to exactly one OpenAI Function (see the next steps of the guide).

For each action, we need to specify arguments and add printing of relevant information. For example, for `list_files` it makes sense to return a list of files within the folder.
Inside actions, various operations are called within the sandbox.

```python
# List of actions for the assistant
def create_directory(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    directory = args["path"]
    print_sandbox_action("Creating directory", directory)

    try:
        sandbox.filesystem.make_dir(directory)
        return "success"
    except Exception as e:
        return f"Error: {e}"


def save_content_to_file(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    path = args["path"]
    content = args["content"]
    print_sandbox_action("Saving content to", path)

    try:
        dir = os.path.dirname(path)
        sandbox.filesystem.make_dir(dir)
        sandbox.filesystem.write(path, content)
        return "success"
    except Exception as e:
        return f"Error: {e}"


def list_files(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    path = args["path"]
    print_sandbox_action("Listing files on path", path)

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
    print_sandbox_action("Reading file on path", path)

    try:
        return sandbox.filesystem.read(path)
    except Exception as e:
        return f"Error: {e}"


def commit(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    repo_directory = "/home/user/repo"
    commit_message = args["message"]
    print_sandbox_action("Committing with the message", commit_message)

    git_add_proc = sandbox.process.start_and_wait(f"git -C {repo_directory} add .")
    if git_add_proc.exit_code != 0:
        error = f"Error adding files to staging: {git_add_proc.stdout}\n\t{git_add_proc.stderr}"
        console.print("\t[bold red]Error:[/bold red]", error)
        return error

    git_commit_proc = sandbox.process.start_and_wait(
        f"git -C {repo_directory} commit -m '{commit_message}'"
    )
    if git_commit_proc.exit_code != 0:
        error = f"Error committing changes: {git_commit_proc.stdout}\n\t{git_commit_proc.stderr}"
        console.print("\t[bold red]Error:[/bold red]", error)
        return error

    return "success"


def make_pull_request(sandbox: Sandbox, args: Dict[str, Any]) -> str:
    base_branch = "main"
    random_letters = "".join(random.choice(string.ascii_letters) for _ in range(5))
    new_branch_name = f"ai-developer-{random_letters}"

    title = args["title"]
    body = ""

    print_sandbox_action(
        "Making a pull request", f"from '{new_branch_name}' to '{base_branch}'"
    )

    git_checkout_proc = sandbox.process.start_and_wait(
        f"git -C {REPO_DIRECTORY} checkout -b {new_branch_name}"
    )
    if git_checkout_proc.exit_code != 0:
        error = f"Error creating a new git branch {new_branch_name}: {git_checkout_proc.stdout}\n\t{git_checkout_proc.stderr}"
        console.print("\t[bold red]Error:[/bold red]", error)
        return error

    git_push_proc = sandbox.process.start_and_wait(
        f"git -C {REPO_DIRECTORY} push -u origin {new_branch_name}"
    )
    if git_push_proc.exit_code != 0:
        error = (
            f"Error pushing changes: {git_push_proc.stdout}\n\t{git_push_proc.stderr}"
        )
        console.print("\t[bold red]Error:[/bold red]", error)
        return error

    gh_pull_request_proc = sandbox.process.start_and_wait(
        cmd=f'gh pr create --base "{base_branch}" --head "{new_branch_name}" --title "{title}" --body "{body}"'.replace(
            "`", "\\`"
        ),
        cwd=REPO_DIRECTORY,
    )
    if gh_pull_request_proc.exit_code != 0:
        error = f"Error creating pull request: {gh_pull_request_proc.stdout}\n\t{gh_pull_request_proc.stderr}"
        console.print("\t[bold red]Error:[/bold red]", error)
        return error

    return "success"
```

## 3. Build the assistant
Now we create the AI developer itself inside the [`assistant.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/assistant.py?ref=cookbook-ai-github-developer). The specific feature of the OpenAI's Assistants API that we'll take advantage of is [Function calling](https://platform.openai.com/docs/guides/function-calling).

> Function calling feature gives our AI assistant the ability to decide to call the sandbox actions we defined in the [`actions.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/actions.py?ref=cookbook-ai-github-developer).
>
### 3.1 Import packages
```python
from typing import List

from dotenv import load_dotenv
import openai
from openai.types.beta.assistant_create_params import Tool

load_dotenv()
```
### 3.2 Define the assistant
Now we create the assistant and equip it with six functions (remember, these are the OpenAI Functions, not Python functions) where each corresponds to one action defined previously in the `actions.py`.

```python
def create_assistant():
    client = openai.Client()

    functions: List[Tool] = [
        {
            "type": "function",
            "function": {
                "name": "create_directory",
                "description": "Create a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the directory to be created",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "save_content_to_file",
                "description": "Save content (code or text) to file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The content to save",
                        },
                        "path": {
                            "type": "string",
                            "description": "The path to the file, including extension",
                        },
                    },
                    "required": ["content", "path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "List files in a directory",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the directory",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "The path to the file",
                        },
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "commit",
                "description": "Commit changes to the repo",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "description": "The commit message",
                        },
                    },
                    "required": ["message"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "make_pull_request",
                "description": "Creates a new branch and makes a pull request",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "The title of the pull request",
                        }
                    },
                    "required": ["title"],
                },
            },
        },
    ]
```
### 3.3 Write system prompt
Still inside the `create_assistant()` function, we give instructions to the assistant and choose its parameters. Once we run this file, it prints the assistant's ID which we can save as an environment variable.
Don't forget to re-run the file with assistant and create new ID every time you update it.

> 💡 **Tip**: Adjust the instructions as needed. For example, you can decide how much the AI developer engages in discussion with user vs limiting itself to performing given task. 
> The OpenAI's [**prompt engineering guide**](https://platform.openai.com/docs/guides/prompt-engineering/six-strategies-for-getting-better-results) may come handy.

```python
    ai_developer = client.beta.assistants.create(
        instructions="""You are an AI developer. You help user work on their tasks related to coding in their codebase. The provided codebase is in the /home/user/repo.
    When given a coding task, work on it until completion, commit it, and make pull request.

    If you encounter a problem, communicate it promptly, please.

    You can create and save content (text or code) to a specified file (or create a new file), list files in a given directory, read files, commit changes, and make pull requests. Always make sure to write the content in the codebase.

    By default, always either commit your changes or make a pull request after performing any action on the repo. This helps in reviewing and merging your changes.
    Name the PR based on the changes you made.

    Be professional, avoid arguments, and focus on completing the task.

    When you finish the task, always provide the link to the pull request you made (if you made one.)
    Additionally, be prepared for discussions; not everything user writes implies changes to the repo. For example, if the user writes "thank you", you can simply answer "you are welcome".
    But by default, if you are assigned a task, you should immediately do it in the provided repo, and not talk only talk about your plan.
    """,
        name="AI Developer",
        tools=functions,
        model="gpt-4-1106-preview",
    )

    print("AI Developer Assistant created, copy its id to .env file:")
    print(ai_developer.id)


if __name__ == "__main__":
    create_assistant()
```

## 4. Create the main program
Now we code the core program. The assistant calls OpenAI Functions through JSON, which the E2B SDK parses and automatically invokes defined actions.

### 4.1 Import packages
First, we import the necessary packages - `openai`, `e2b Sandbox`, and the actions we created in the other file.

```python
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
```
### 4.2 Retrieve assistant
We call the assistant using its ID and use the OpenAI API to retrieve the assistant. Don't forget to save assistant's ID, OpenAI API key and E2B API key as environment variables.

```python
load_dotenv()
client = openai.Client()

AI_ASSISTANT_ID = os.getenv("AI_ASSISTANT_ID")
USER_GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")

assistant = client.beta.assistants.retrieve(AI_ASSISTANT_ID)
```

### 4.2 Prompt user for GitHub repo, authentication, and task
We define three functions that ask the user for
- GitHub repository URL
- Specifying the task for the AI agent (e.g., "Please create a calculator in JavaScript and save it to new file")
- GitHub authentication token.

> The user is asked for their GitHub [personal access token (classic)](https://github.com/settings/tokens) as a standard way to interact with the GitHub API securely.

> 💡 **Tip**: Save your GitHub token as `GITHUB_TOKEN` in your `.env` file to avoid having to paste it every time you run the program.

```python
def prompt_user_for_github_repo():
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

```

### 4.3 Setup git
We set up the Git configuration and authentication for the user's account within the specified sandbox environment. It involves configuring the user's email and name, logging in with a GitHub personal access token, and setting up Git credentials for GitHub. To monitor the process, we add printing exit codes in each step.
```python
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
        print("Error: Unable to log into GitHub", end="\n")
        print(proc.stderr)
        print(proc.stdout)
        exit(1)

    # Setup user's Git credentials
    proc = sandbox.process.start_and_wait("gh auth setup-git")
    if proc.exit_code != 0:
        print("Error: Unable to set up Git auth with GitHub")
        print(proc.stderr)
        print(proc.stdout)
        exit(1)
    else:
        print("\n✅ [#666666]Logged in[/#666666]")
```
### 4.4 Clone the repo
Use the sandbox environment to execute a Git clone command and check if the process was successful. We define a way to print the standard output or standard error output from the sandbox (with a specific visual theme).
```python
def clone_repo_in_sandbox(sandbox, repo_url):
    # Clone the repo
    git_clone_proc = sandbox.process.start_and_wait(
        f"git clone {repo_url} {REPO_DIRECTORY}"
    )
    if git_clone_proc.exit_code != 0:
        print("Error: Unable to clone the repo")
        exit(1)


def handle_sandbox_stdout(message):
    console.print(f"[theme][Sandbox][/theme] {message.line}")


def handle_sandbox_stderr(message):
    console.print(f"[theme][Sandbox][/theme] {message.line}")
```

### 4.5 Spawn the sandbox
Now we can define the `main` function to spawn the E2B sandbox.

Inside the function, we choose the preferred E2B sandbox, which is called simply "`Sandbox`", since we chose the default one.

> 💡 **Tip**: E2B offers [premade sandboxes](https://e2b.dev/docs/sandbox/templates/premade?ref=cookbook-ai-github-developer) or an option to build your own [custom](https://e2b.dev/docs/sandbox/templates/overview?ref=cookbook-ai-github-developer) one with preferred packages. To keep this guide simple, we picked the Default Sandbox and equipped it with just the actions we have defined in the [`actions.py`](https://github.com/e2b-dev/e2b-cookbook/blob/main/guides/ai-github-developer-py/ai_github_developer/actions.py?ref=cookbook-ai-github-developer). 

We use a `sandbox.add_action()` method to register the actions with the sandbox.
We start the sandbox and configure the AI assistant in git. We log the user to GitHub via the authentication token.
We assign the user's task to the assistant. Then we create a thread, send messages to the thread, and finally run the thread.

We register actions with the sandbox using a `sandbox.add_action()` method. We start the sandbox, configure the AI developer in Git, and ask the user for a GitHub token, if they haven't added it as the environment variable already.

Then, we assign the user's task to the assistant and create and run a thread to send messages to complete the task.

> Here, we are using OpenAI's concept of threads, messages, and runs.

```python
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

    # Setup git right away so user knows immediately if they passed wrong token
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
```
The threads, messages, and runs are a concept from the OpenAI's Assistants API:

![Assistants API OpenAI](https://ntjfcwpzsxugrykskdgi.supabase.co/storage/v1/object/public/content-assets/004.png?t=2023-12-19T18%3A24%3A46.208Z)

### 4.6 Print assistant's runs
Still  inside the main function, we print the assistant's process to the terminal. Each time the developer chooses to use one of the actions, user can see logs about the chosen action and its success/fail in terminal.

> Note: The assistant's runs duration is by huge part determined by OpenAI.

At the end, we use `time.sleep()` to specify how often we want to poll the assistant's status.

```python
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
```
Finally, under the main function, we write the code that is run if the script is the main program being executed.

```python
if __name__ == "__main__":
    main()
```

## Output

> Find the complete final code [here](https://github.com/e2b-dev/e2b-cookbook/tree/main/guides/ai-github-developer-py?ref=cookbook-ai-github-developer). 🏁
> 
> [Here](https://github.com/tizkovatereza/tt-app?ref=cookbook-ai-github-developer) is an example of a Next.js project bootstrapped with `create-next-app` that the AI developer built.

![Gif example](assets/run_example.gif)

---
**Thank you for reading this guide - and I will appreciate your feedback!**

Reach out to me on my [X (Twitter)](https://twitter.com/tereza_tizkova).

**Where to find E2B:**
- 💻 [Website](https://e2b.dev?ref=cookbook-ai-github-developer)
- 🎮 [Discord server](https://discord.com/invite/U7KEcGErtQ?ref=cookbook-ai-github-developer)
- 📝 [Docs](https://e2b.dev/docs?ref=cookbook-ai-github-developer)
- 🧑🏼‍💻 [GitHub](https://github.com/e2b-dev/e2b?ref=cookbook-ai-github-developer)
- 💬 [X (Twitter)](https://twitter.com/e2b_dev?ref=cookbook-ai-github-developer)
