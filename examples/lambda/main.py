from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from code_interpreter_tool import CodeInterpreterFunctionTool

# Create the agent
model = ChatOpenAI(model_name="gpt-4")
cd_tool = CodeInterpreterFunctionTool()
tools = [cd_tool.to_langchain_tool()]
agent_executor = create_react_agent(model, tools)

# Use the agent
config = {"configurable": {"thread_id": "HI"}}
for chunk in agent_executor.stream(
    {"messages": [HumanMessage(content="hi im bob! what's the 3rd fibonnaci number if the series start with 4 and 5")]}, config
):
    print(chunk)
    print("----")
