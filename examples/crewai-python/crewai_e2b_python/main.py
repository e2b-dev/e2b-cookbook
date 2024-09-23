from dotenv import load_dotenv
from crewai import Agent, Task  
from crewai_e2b_python.code_interpreter_tool import CodeInterpreterTool
import json

load_dotenv()

def main():

    # Initialize the code interpreter tool
    # We use result_as_answer=True to prevent the agent from changing the output after the last step
    code_interpreter = CodeInterpreterTool(result_as_answer=True);

    # Create the CrewAI agent
    agent = Agent(
        role='Code Interpreter',
        goal='Assist in interpreting code and performing tasks.',
        backstory='An expert tool handler capable of executing code.',
        tools=[code_interpreter],
        verbose=True,
    )

    # Define the task at hand
    # We specify that the code should use the print() function rather than leaving the variable on the last line
    scrape_hacker_news = Task(
        description='Scrape the Hacker News homepage.',
        expected_output='Print the list of articles as a JSON array like [{"headline","url"},...] using the print() function.',
        agent=agent,
    )

    # Run the agent
    task_output = agent.execute_task(scrape_hacker_news)

    # Parse the last printed line from the code interpreter's output
    task_result = json.loads(task_output)["stdout"][-1]
    parsed_result = json.loads(task_result)

    # Print the results
    BLUE, RESET = '\033[94m', '\033[0m'
    print(f"{BLUE}{json.dumps(parsed_result, indent=2)}{RESET}")

    # Close the code interpreter
    code_interpreter.close()

if __name__ == "__main__":
    main()
