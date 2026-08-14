import base64

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from langgraph_e2b_python.code_interpreter_tool import (
    CodeInterpreterTool,
    create_code_interpreter_tool,
)

load_dotenv()


def main():
    # Pick your favourite LLM
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    # Initialize CodeInterpreterTool - defined in code_interpreter_tool.py
    with CodeInterpreterTool() as interpreter:
        # Create ReAct agent from LangGraph preset
        agent = create_react_agent(
            model=llm,
            tools=[create_code_interpreter_tool(interpreter)],
            prompt="You are a helpful assistant that can execute Python code to help answer questions.",
        )

        # Invoke agent to plot and show sinus
        result = agent.invoke(
            {"messages": [{"role": "user", "content": "plot and show sinus"}]}
        )
        print(result)

        # Save PNG chart
        for r in interpreter.last_results:
            if hasattr(r, "png") and r.png:
                png_data = base64.b64decode(r.png)
                with open("chart.png", "wb") as f:
                    f.write(png_data)
                print("Saved chart to chart.png")
                break

if __name__ == "__main__":
    main()