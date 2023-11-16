import os


from dotenv import load_dotenv
from e2b import Sandbox
import openai

from actions import read_file, save_code_to_file, list_files

load_dotenv()
client = openai.Client()

AI_ASSISTANT_ID = os.getenv("AI_ASSISTANT_ID")
assistant = client.beta.assistants.retrieve(AI_ASSISTANT_ID)


def main():
    sandbox = Sandbox()

    sandbox.add_action(read_file).add_action(save_code_to_file).add_action(list_files)

    task = "Write a function that takes a list of strings and returns the longest string in the list."

    thread = client.beta.threads.create(
        messages=[
            {
                "role": "user",
                "content": f"Carefully plan this task and start working on it: {task}",
            },
        ],
    )

    run = client.beta.threads.runs.create(thread_id=thread.id, assistant_id=assistant.id)

    while True:
        if run.status == "requires_action":
            print("Run requires action")
            print("Inputs:", run.required_action.submit_tool_outputs.tool_calls)
            outputs = sandbox.openai.actions.run(run)
            print("Outputs:", outputs)
            if len(outputs) > 0:
                client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread.id, run_id=run.id, tool_outputs=outputs
                )

        elif run.status == "completed":
            print("Run completed")
            messages = (
                client.beta.threads.messages.list(thread_id=thread.id).data[0].content
            )
            text_messages = [message for message in messages if message.type == "text"]
            print("Thread finished:", text_messages[0].text.value)
            break

        elif run.status in ["queued", "in_progress"]:
            print(f"Waiting for the run to finish: {run.status}")
            pass

        elif run.status in ["cancelled", "cancelling", "expired", "failed"]:
            print(f"Run failed: {run.status}")
            break

        else:
            print(f"Unknown status: {run.status}")
            break

        run = client.beta.threads.runs.retrieve(thread_id=thread.id, run_id=run.id)

    sandbox.close()


if __name__ == "__main__":
    main()
