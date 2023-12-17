from typing import List

from dotenv import load_dotenv
import openai
from openai.types.beta.assistant_create_params import Tool

load_dotenv()

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
                        "directory": {
                            "type": "string",
                            "description": "The path to the directory to be created",
                        },
                    },
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
                        "filename": {
                            "type": "string",
                            "description": "The filename including the path and extension",
                        },
                    },
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
                },
            },
        },
        # {
        #     "type": "function",
        #     "function": {
        #         "name": "commit_and_push",
        #         "description": "Commit and push changes to the repository",
        #         "parameters": {
        #             "type": "object",
        #             "properties": {
        #                 "commit_message": {
        #                     "type": "string",
        #                     "description": "The commit message",
        #                 },
        #             },
        #         },
        #     },
        # },
            {
    "type": "function",
    "function": {
        "name": "make_pull_request",
        "description": "Create a pull request",
        "parameters": {
            "type": "object",
            "properties": {
                "repo_directory": {
                    "type": "string",
                    "description": "The directory where the repository is cloned",
                },
                "base_branch": {
                    "type": "string",
                    "description": "The base branch for the pull request",
                },
                "new_branch": {
                    "type": "string",
                    "description": "The new branch you want to create the pull request for",
                },
                "title": {
                    "type": "string",
                    "description": "The title of the pull request",
                },
                "body": {
                    "type": "string",
                    "description": "The description or body of the pull request",
                },
            },
        },
    },
},

    ai_developer = client.beta.assistants.create(
    instructions="""You are an AI developer.
    The provided codebase is in the /home/user/repo.
    When given a coding task, you will work on it until it is completed. You will summarize your steps.
    If you encounter some problem, just communicate it, please. 
    You can save content (text or code) to file (or create a new file), list files in a given directory, read files, commit and push changes, and move files within the repository.
    By default, always make a pull request after performing any action on the repository. This helps in reviewing and merging your changes.
    Please try to use actions only when they are relevant to the task. Sometimes, engage in a chat and reply with text without performing actions.
    You are professional, don't argue, and just complete the task.
    When you finish the task, please always add the link to the original repository (not to a particular commit, but to the repo as a whole.)
    """,
    name="AI Developer",
    tools=functions,
    model="gpt-4-1106-preview",
)

    print("AI Developer Assistant created, copy its id to .env file:")
    print(ai_developer.id)

if __name__ == "__main__":
    create_assistant()
