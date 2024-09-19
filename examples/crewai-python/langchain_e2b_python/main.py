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
    tools = [MyCustomTool()] # result_as_answer=True

    # Create the CrewAI agent
    agent = Agent(
        role='Code Interpreter',
        goal='Assist in interpreting code and performing tasks like plotting.',
        backstory='An expert tool handler capable of executing code.',
        tools=tools,
        #max_iter=1
    )

    #plot_curve = Task(
    #    description='Plot and show a sin curve.',
    #    expected_output='An image.',
    #    agent=agent,
    #    output_file='result.png'
    #)

    get_stonk = Task(
        description='Get Apple\'s stock value using a Python library.',
        expected_output='current stock price',
        agent=agent,
    )

    hacker_news = Task(
        description='Scrape the Hacker News homepage.',
        expected_output='list of headlines',
        agent=agent,
    )

    task_result = agent.execute_task(hacker_news)
    print(task_result)

    #tool = MyCustomTool()
    #result = tool.run("""23*324""")
    #print(result)

    # Assemble a crew with planning enabled
    #crew = Crew(
    #    agents=[agent],
    #    tasks=[get_stonk],
    #    verbose=True,
    #    planning=True,
    #)

    # Execute tasks
    #crew.kickoff()

    code_interpreter.close()

if __name__ == "__main__":
    main()
