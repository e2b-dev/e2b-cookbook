from dotenv import load_dotenv
from crewai import Agent, Task  
from crewai_e2b_python.code_interpreter_tool import CodeInterpreterTool
import json

load_dotenv()

def main():

    # Initialize the code interpreter tool
    code_interpreter = CodeInterpreterTool();

    # Create the CrewAI agent
    agent = Agent(
        role='Code Interpreter',
        goal='Assist in interpreting code and performing tasks.',
        backstory='An expert tool handler capable of executing code.',
        tools=[code_interpreter],
        verbose=True,
    )

    # Define the web scraping task
    scrape_hacker_news = Task(
        description='Scrape the Hacker News homepage.',
        expected_output='list of headlines',
        agent=agent,
    )

    # Run the agent and print the results
    task_result = agent.execute_task(scrape_hacker_news)
    print(json.dumps(task_result, indent=2))

    # Close the code interpreter
    code_interpreter.close()

if __name__ == "__main__":
    main()
