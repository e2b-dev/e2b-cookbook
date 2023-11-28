# Import libraries
import os
import e2b
import openai
from openai import OpenAI

# Set up API key
from dotenv import load_dotenv
import json

load_dotenv()
openai.api_key = os.environ["OPENAI_API_KEY"]


# Optional - import types, allowing for explicit type hints
from typing import Any, Dict


from typing import List
from openai.types.beta.assistant_create_params import Tool


def create_assistant():
    client = openai.Client()
    
    functions: List[Tool] = [
        {
            "type": "function",
            "function": {
                "name": "save_code_to_file",
                "description": "Save code to file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "The code to save",
                        },
                        "filename": {
                            "type": "string",
                            "description": "The filename including the path and extension",
                        },
                    },
                },
            },
        },

    ]

    # current_directory = os.getcwd()

    ai_developer = client.beta.assistants.create(
        instructions="""You are an AI developer.

    When given a coding task, write and save code to files and install any packages if needed.
    Start by listing all files inside the repo. You work inside the '/home/user/repo' directory.

    Please print any code that you have written there also to the terminal.

    Thank you, you're the best!
    """,
        name="AI Developer",
        tools=functions,
        model="gpt-4-1106-preview",
    )

    print("AI Developer Assistant created, please copy its ID below to your .env file. You can find all your created assistants at https://platform.openai.com/assistants.")
    print(ai_developer.id)


if __name__ == "__main__":
    create_assistant()

