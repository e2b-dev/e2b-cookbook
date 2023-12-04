import os
from dotenv import load_dotenv
from e2b import Sandbox
import openai
import time
from actions import read_file, save_code_to_file, list_files, commit_and_push, write_to_file

load_dotenv()
client = openai.Client()

AI_ASSISTANT_ID = os.getenv("AI_ASSISTANT_ID")
assistant = client.beta.assistants.retrieve(AI_ASSISTANT_ID)

# defining the prompt for repo URL
def prompt_user_for_github_repo():
    github_repo_url = input("Please provide the URL of your public GitHub repository: ")
    repo_url = github_repo_url
    return repo_url

# defining the prompt for specifying user task with github repo
def prompt_user_for_task(repo_url):
    user_task_specification = input("Please provide what you want to achieve with that repository: ")
    user_task = (
        f"Please work with the codebase repository called {repo_url} "
        f"that is cloned in the /home/user/repo directory. Your task is: {user_task_specification}"
    )
    return user_task



# letting user provide authenrtication for the sandbox
def prompt_user_for__auth():
    user_auth = input("Please provide your github authentication token: ")
    return user_auth




# determining the directory where we clone the repository
repo_directory = "/home/user/repo"

def main():
    sandbox = Sandbox(
        on_stderr=lambda message: print('[Sandbox stderr]', message),
        on_stdout=lambda message: print('[Sandbox stdout]', message),
    )
    sandbox.add_action(read_file).add_action(save_code_to_file).add_action(list_files).add_action(commit_and_push).add_action(write_to_file)


    # Identify AI developer in git
    sandbox.process.start_and_wait("git config --global user.email 'ai-developer@email.com'")
    sandbox.process.start_and_wait("git config --global user.name 'AI Developer'")


    # TODO: Prompt user for github token
    user_gh_token = "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"    
    # Log in to github    
    print("Logging you into your GitHub...")
    proc = sandbox.process.start_and_wait(f"echo {user_gh_token} | gh auth login --with-token")
    if proc.exit_code != 0:
        print("Error: Unable to log into github")
        print(proc.stderr)
        print(proc.stdout)
        exit(1)    
    # Check that user is logged into github
    proc = sandbox.process.start_and_wait("gh auth status")
    if proc.exit_code != 0:
        print("Error: Unable to log into github")
        print(proc.stderr)
        print(proc.stdout)
        exit(1)    

    # TODO: Uncomment
    repo_url = prompt_user_for_github_repo()
    user_task = prompt_user_for_task(repo_url)

    # TODO: Remove
    # user_task = "Please write some random content to readme.md. Commit and push changes."
    # repo_url = "https://github.com/tizkovatereza/T_learns_javascript.git"



    git_clone_proc = sandbox.process.start_and_wait(f"git clone {repo_url} {repo_directory}")
    if git_clone_proc.exit_code != 0:
        print("Error: Unable to clone the repository")
        exit(1)

    user_auth = prompt_user_for__auth()
    git_auth = sandbox.process.start_and_wait(f"TBD{user_auth}")


    task = user_task
    thread = client.beta.threads.create(
        messages=[
            {
                "role": "user",
                "content": f"Carefully plan this task and start working on it: {task} in the {repo_url} repository",
            },
        ],
    )

    run = client.beta.threads.runs.create(thread_id=thread.id, assistant_id=assistant.id)

    while True:
        print("Assistant is currently in status:", run.status)        
        if run.status == "requires_action":
            print("Assistant run:")
            print()
            print(f"ID: {run.id}")
            # print(f"Assistant ID: {run.assistant_id}")
            print(f"Status: {run.status}")
            # print(f"Instructions: {run.instructions}")
            # print(f"Metadata: {run.metadata}")
            # print(f"Model: {run.model}")
            print(f"Required Action: {run.required_action}")
            #print(f"Started At: {run.started_at}")
            #print("Assistant run", run)
            print()
            outputs = sandbox.openai.actions.run(run) #TBD PRINT OUTPUTS OF TOOLS
            print(outputs)
            print()
            if len(outputs) > 0:
                client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread.id, run_id=run.id, tool_outputs=outputs
                )

        elif run.status == "completed":
            print("Run completed")
            messages = client.beta.threads.messages.list(thread_id=thread.id).data[0].content
            text_messages = [message for message in messages if message.type == "text"]
            print("Thread finished:", text_messages[0].text.value)
            break

        elif run.status in ["queued", "in_progress"]:
            pass

        elif run.status in ["cancelled", "cancelling", "expired", "failed"]:
            break

        else:
            print(f"Unknown status: {run.status}")
            break

        run = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)
        time.sleep(0.2)

    sandbox.close()

if __name__ == "__main__":
    main()


# TBD
# Log in sandbox into github
# Get github CLI into sandbox
# Lof in the github CLI - read github docs
# "please provide your github access token"



# Install or upgrade git
# git --version
# brew upgrade git

# Set up GIT username GLOBALLY
# git config --global user.name "Your preferred name"
# git config --global user.name (check that it is set up)

# Set up GIT username FOR GIVEN REPOSITORY
# Change directory to the repository directory
# git config user.name "Your preferred name"
# git config user.name (check that it is set up)

# Set up GIT email GLOBALLY
# git config --global user.email "YOUR_EMAIL"


# gh install gh
# brew upgrade gh
# gh auth login -> setting up my github token


# When you connect to a GitHub repository from Git, you will need to authenticate with GitHub using either HTTPS or SSH.
# Note: You can authenticate to GitHub using GitHub CLI, for either HTTP or SSH. For more information, see gh auth login.

