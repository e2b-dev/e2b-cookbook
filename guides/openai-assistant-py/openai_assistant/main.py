import openai

from e2b import Sandbox

from .actions import read_file, save_code_to_file, list_files


sandbox = Sandbox("ai-developer-sandbox")

sandbox.add_action(read_file).add_action(save_code_to_file).add_action(list_files)

task = "Write a function that takes a list of strings and returns the longest string in the list."

client = openai.Client()

thread = client.beta.threads.create(
    messages=[
        {
            "role": "user",
            "content": f"Carefully plan this task and start working on it: {task}",
        },
    ],
)

assistant = client.beta.assistants.retrieve("ai-developer-assistant")

run = client.beta.threads.runs.create(thread_id=thread.id, assistant_id=assistant.id)

while True:
    if run.status == "requires_action":
        outputs = sandbox.openai.actions.run(run)
        if len(outputs) > 0:
            client.beta.threads.runs.submit_tool_outputs(
                thread_id=thread.id, run_id=run.id, tool_outputs=outputs
            )

    elif run.status == "completed":
        messages = (
            client.beta.threads.messages.list(thread_id=thread.id).data[0].content
        )
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

sandbox.close()
