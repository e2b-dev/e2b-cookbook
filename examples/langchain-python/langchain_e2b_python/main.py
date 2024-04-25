from dotenv import load_dotenv
load_dotenv()

from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
from langchain_e2b_python.code_interpreter_tool import CodeInterpreterFunctionTool
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain import hub


def main():
  # 1. Pick your favorite llm
  llm = ChatGroq(temperature=0, model_name="llama3-70b-8192")
  code_interpreter = CodeInterpreterFunctionTool().to_langchain_tool()
  tools = [code_interpreter]
  prompt = hub.pull("hwchase17/openai-functions-agent")
  agent = create_tool_calling_agent(llm, tools, prompt)

  agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
  response = agent_executor.invoke({"input": "use code interpreter to calcule value of pi using monte carlo method"})
  print(response)


