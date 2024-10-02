import base64

from typing import List, Sequence, Tuple
from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_e2b_python.code_interpreter_tool import CodeInterpreterFunctionTool
from langchain.agents import AgentExecutor
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage
from langchain_core.runnables import RunnablePassthrough
from langchain.agents.output_parsers.tools import (
    ToolAgentAction,
    ToolsAgentOutputParser,
)
from e2b_code_interpreter import Result


load_dotenv()


def format_to_tool_messages(
    intermediate_steps: Sequence[Tuple[ToolAgentAction, dict]],
) -> List[BaseMessage]:
    messages = []
    for agent_action, observation in intermediate_steps:
        if agent_action.tool == CodeInterpreterFunctionTool.tool_name:
            new_messages = CodeInterpreterFunctionTool.format_to_tool_message(
                agent_action,
                observation,
            )
            messages.extend([new for new in new_messages if new not in messages])
        else:
            # Handle other tools
            print("Not handling tool: ", agent_action.tool)

    return messages


def main():
    # 1. Pick your favorite llm
    llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)
    # llm = ChatGroq(temperature=0, model_name="llama3-70b-8192")

    # 2. Initialize the code interpreter tool
    code_interpreter = CodeInterpreterFunctionTool()
    code_interpreter_tool = code_interpreter.to_langchain_tool()
    tools = [code_interpreter_tool]

    # 3. Define the prompt
    prompt = ChatPromptTemplate.from_messages(
        [("human", "{input}"), ("placeholder", "{agent_scratchpad}")]
    )

    # 4. Define the agent
    agent = (
        RunnablePassthrough.assign(
            agent_scratchpad=lambda x: format_to_tool_messages(x["intermediate_steps"])
        )
        | prompt
        | llm.bind_tools(tools)
        | ToolsAgentOutputParser()
    )

    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        return_intermediate_steps=True,
    )

    # 5. Invoke the agent
    result = agent_executor.invoke({"input": "plot and show sinus"})

    code_interpreter.close()

    print(result)

    # Each intermediate step is a Tuple[ToolAgentAction, dict]
    r: Result = result["intermediate_steps"][0][1]["results"][0]

    # Save the chart image
    for format, data in r.raw.items():
        if format == "image/png":
            with open("image.png", "wb") as f:
                f.write(base64.b64decode(data))
        else:
            print(data)
