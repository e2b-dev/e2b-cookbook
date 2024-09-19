import base64
import os
from typing import List, Sequence, Tuple
from dotenv import load_dotenv
from crewai import Agent, Task, Crew
from langchain_e2b_python.code_interpreter_tool import CodeInterpreterFunctionTool, MyCustomTool
from langchain.agents import Tool
from langchain_core.messages import BaseMessage
from e2b_code_interpreter import Result


load_dotenv()

def main():
    # Initialize the code interpreter tool
    code_interpreter = CodeInterpreterFunctionTool()
    code_interpreter_tool = Tool(
        name=CodeInterpreterFunctionTool.tool_name,
        func=code_interpreter.to_langchain_tool().run,
        description="A code interpreter tool."
    )
    tools = [MyCustomTool(result_as_answer=True)]

    # Create the CrewAI agent
    agent = Agent(
        role='Code Interpreter',
        goal='Assist in interpreting code and performing tasks like plotting.',
        backstory='An expert tool handler capable of executing code.',
        tools=tools
    )

    plot_curve = Task(
        description='Plot and show a sin curve.',
        expected_output='An image.',
        agent=agent,
        output_file='result.png'
    )

    #task_result = agent.execute_task(plot_curve)
    #print(task_result)

    # Assemble a crew with planning enabled
    crew = Crew(
        agents=[agent],
        tasks=[plot_curve],
        verbose=True,
        planning=True,
    )

    # Execute tasks
    crew.kickoff()

    code_interpreter.close()

if __name__ == "__main__":
    main()
