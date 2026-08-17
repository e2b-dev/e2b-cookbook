import asyncio

from dotenv import load_dotenv
from stirrup import Agent
from stirrup.clients.chat_completions_client import ChatCompletionsClient
from stirrup.tools.code_backends.e2b import E2BCodeExecToolProvider


async def main():

    load_dotenv()


    client = ChatCompletionsClient(
        base_url="https://openrouter.ai/api/v1",
        model="anthropic/claude-sonnet-5",
    )

    code_exec = E2BCodeExecToolProvider(template="code-interpreter-v1")
    agent = Agent(client=client, name="agent", tools=[code_exec], max_turns=15)

    async with agent.session(output_dir="output") as session:
        _finish_params, _history, _metadata = await session.run(
            "Generate the first 50 numbers of the Fibonacci sequence and create "
            "a line chart showing the growth. Save the chart as fibonacci.png"
        )


if __name__ == "__main__":
    asyncio.run(main())
