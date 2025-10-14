import base64

from typing import List
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph_e2b_python.code_interpreter_tool import (
    CodeInterpreterFunctionTool,
    RichToolMessage,
)
from langchain_openai import ChatOpenAI
from langgraph.graph import END, MessageGraph
from e2b import Result

load_dotenv()


# Define the function that determines whether to continue or not
def should_continue(messages) -> str:
    last_message = messages[-1]
    # If there is no function call, then we finish
    if not last_message.tool_calls:
        return END
    else:
        return "action"


# Handle tools execution
def execute_tools(messages, tool_map) -> List[RichToolMessage]:
    tool_messages = []
    for tool_call in messages[-1].tool_calls:
        tool = tool_map[tool_call["name"]]
        if tool_call["name"] == CodeInterpreterFunctionTool.tool_name:
            output = tool.invoke(tool_call["args"])
            message = CodeInterpreterFunctionTool.format_to_tool_message(
                tool_call["id"],
                output,
            )
            tool_messages.append(message)
        else:
            content = tool.invoke(tool_call["args"])
            tool_messages.append(RichToolMessage(content, tool_call_id=tool_call["id"]))
    return tool_messages


def main():
    # 1. Pick your favorite llm
    llm = ChatOpenAI(model="gpt-3.5-turbo-0125", temperature=0)
    # llm = ChatGroq(temperature=0, model_name="llama3-70b-8192")

    # 2. Initialize the code interpreter tool
    code_interpreter = CodeInterpreterFunctionTool()
    code_interpreter_tool = code_interpreter.to_langchain_tool()
    tools = [code_interpreter_tool]
    tool_map = {tool.name: tool for tool in tools}

    # 3. Define the graph
    workflow = MessageGraph()
    workflow.add_node("agent", llm.bind_tools(tools))
    workflow.add_node("action", lambda x: execute_tools(x, tool_map))

    # Conditional agent -> action OR agent -> END
    workflow.add_conditional_edges(
        "agent",
        should_continue,
    )
    # Always transition `action` -> `agent`
    workflow.add_edge("action", "agent")

    workflow.set_entry_point("agent")

    app = workflow.compile()

    # 4. Invoke the graph
    result = app.invoke([("human", "plot and show sinus")])

    code_interpreter.close()

    print(result)

    # Save the chart image
    for message in result:
        if hasattr(message, "raw_output"):
            if message.raw_output["results"]:
                rs = message.raw_output["results"]
                first_result = rs[0]

                # Save the received PNG chart
                if first_result.png:
                    # Decode the base64 encoded PNG data
                    png_data = base64.b64decode(first_result.png)

                    # Save the decoded PNG data to a file
                    filename = f"chart.png"
                    with open(filename, "wb") as f:
                        f.write(png_data)
                    print(f"Saved chart to {filename}")
