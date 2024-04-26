import json

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
            print("Not handling tool: ", agent_action.tool)
            # TODO: Handle other tools
            pass

    return messages


def main():
    # 1. Pick your favorite llm
    llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)
    # llm = ChatGroq(temperature=0, model_name="llama3-70b-8192")
    code_interpreter = CodeInterpreterFunctionTool().to_langchain_tool()
    tools = [code_interpreter]
    prompt = ChatPromptTemplate.from_messages(
        [("human", "{input}"), ("placeholder", "{agent_scratchpad}")]
    )

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
    result = agent_executor.invoke({"input": "print foo"})
    print(result)

    # Each intermediate step is a Tuple[ToolAgentAction, dict]
    print(result["intermediate_steps"][0][1]["results"])
