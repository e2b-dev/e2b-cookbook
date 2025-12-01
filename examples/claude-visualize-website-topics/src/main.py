"""
Visualizing Website Topics (Claude + Firecrawl + E2B)

Powered by Claude 3.5 Sonnet, Firecrawl, and Code Interpreter SDK by E2B

Scrape a website with Firecrawl and then plot the most common topics using Claude and Code Interpreter
"""

import os
from firecrawl import FirecrawlApp
from dotenv import load_dotenv
from anthropic import Anthropic
from e2b_code_interpreter import Sandbox


# Load environment variables
load_dotenv()

# Get API keys from environment
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
E2B_API_KEY = os.getenv("E2B_API_KEY")

# Model configuration
# Use the model name that's available with your API key
# Common options: claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-sonnet-20240229
MODEL_NAME = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

SYSTEM_PROMPT = """
## your job & context
you are a python data scientist. you are given tasks to complete and you run python code to solve them.
- the python code runs in jupyter notebook.
- every time you call `execute_python` tool, the python code is executed in a separate cell. it's okay to multiple calls to `execute_python`.
- display visualizations using matplotlib or any other visualization library directly in the notebook. don't worry about saving the visualizations to a file.
- you have access to the internet and can make api requests.
- you also have access to the filesystem and can read/write files.
- you can install any pip package (if it exists) if you need to but the usual packages for data analysis are already preinstalled.
- you can run any python code you want, everything is running in a secure sandbox environment.

## style guide
tool response values that have text inside "[]"  mean that a visual element got rended in the notebook. for example:
- "[chart]" means that a chart was generated in the notebook.
"""

tools = [
    {
        "name": "execute_python",
        "description": "Execute python code in a Jupyter notebook cell and returns any result, stdout, stderr, display_data, and error.",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The python code to execute in a single cell."
                }
            },
            "required": ["code"]
        }
    }
]


def crawl_website(url: str, limit: int = 5):
    """
    Crawl a website using Firecrawl.

    Args:
        url: The URL to crawl
        limit: Maximum number of pages to crawl

    Returns:
        List of crawl results with 'content' field removed
    """
    print(f"Crawling website: {url}")
    app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)

    # Use the new API - crawl returns a CrawlJob object
    crawl_job = app.crawl(url, limit=limit)
    cleaned_crawl_result = []

    if crawl_job is not None and hasattr(crawl_job, 'data') and crawl_job.data is not None:
        # Convert crawl results to JSON format, excluding 'content' field from each entry
        # The data is now Pydantic models, so we need to convert to dict first
        cleaned_crawl_result = []
        for entry in crawl_job.data:
            # Convert Pydantic model to dict
            entry_dict = entry.model_dump() if hasattr(entry, 'model_dump') else dict(entry)
            # Remove content field to reduce size
            cleaned_entry = {k: v for k, v in entry_dict.items() if k != 'content'}
            cleaned_crawl_result.append(cleaned_entry)
        print(f"Successfully crawled {len(cleaned_crawl_result)} pages")
    else:
        print("No data returned from crawl.")

    return cleaned_crawl_result


def code_interpret(e2b_code_interpreter, code: str, output_dir: str = "output", visualization_counter: dict = None):
    """
    Execute Python code using E2B Code Interpreter.

    Args:
        e2b_code_interpreter: The E2B sandbox instance
        code: Python code to execute
        output_dir: Directory to save visualization outputs
        visualization_counter: Dict to track visualization count across calls

    Returns:
        Execution results including stdout, stderr, and display results
    """
    print("Running code interpreter...")

    # Initialize counter if not provided
    if visualization_counter is None:
        visualization_counter = {"count": 0}

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # Collect stdout and stderr
    stdout_lines = []
    stderr_lines = []

    exec_result = e2b_code_interpreter.run_code(
        code,
        on_stderr=lambda stderr: stderr_lines.append(stderr.text if hasattr(stderr, 'text') else str(stderr)),
        on_stdout=lambda stdout: stdout_lines.append(stdout.text if hasattr(stdout, 'text') else str(stdout)),
        timeout=600
    )

    if exec_result.error:
        error_msg = f"Error: {exec_result.error}"
        print("[Code Interpreter ERROR]", error_msg)
        return error_msg

    # Build comprehensive result
    result_parts = []

    # Add stdout if present
    if stdout_lines:
        stdout_text = "".join(stdout_lines)
        print("[Code Interpreter stdout]", stdout_text)
        result_parts.append(f"Stdout:\n{stdout_text}")

    # Add stderr if present
    if stderr_lines:
        stderr_text = "".join(stderr_lines)
        print("[Code Interpreter stderr]", stderr_text)
        result_parts.append(f"Stderr:\n{stderr_text}")

    # Save and download visualizations
    if exec_result.results:
        print(f"[Code Interpreter] Generated {len(exec_result.results)} visualization(s)")

        saved_files = []
        for result in exec_result.results:
            # Increment counter for each visualization
            visualization_counter["count"] += 1
            idx = visualization_counter["count"]

            # Check if result has image data
            if hasattr(result, 'png') and result.png:
                # Save PNG data to file
                filename = f"visualization_{idx}.png"
                filepath = os.path.join(output_dir, filename)

                # Decode base64 PNG data and save
                import base64
                png_data = base64.b64decode(result.png)
                with open(filepath, 'wb') as f:
                    f.write(png_data)

                saved_files.append(filepath)
                print(f"[Code Interpreter] Saved visualization to {filepath}")

            # Also check for other formats
            elif hasattr(result, 'jpeg') and result.jpeg:
                filename = f"visualization_{idx}.jpg"
                filepath = os.path.join(output_dir, filename)

                import base64
                jpeg_data = base64.b64decode(result.jpeg)
                with open(filepath, 'wb') as f:
                    f.write(jpeg_data)

                saved_files.append(filepath)
                print(f"[Code Interpreter] Saved visualization to {filepath}")

        if saved_files:
            result_parts.append(f"Generated {len(saved_files)} visualization(s), saved to: {', '.join(saved_files)}")
        else:
            result_parts.append(f"Generated {len(exec_result.results)} visualization(s) (no image data to save)")

    return "\n\n".join(result_parts) if result_parts else "Code executed successfully"


def process_tool_call(e2b_code_interpreter, tool_name: str, tool_input: dict, visualization_counter: dict = None):
    """
    Process a tool call from Claude.

    Args:
        e2b_code_interpreter: The E2B sandbox instance
        tool_name: Name of the tool to execute
        tool_input: Input parameters for the tool
        visualization_counter: Counter for unique visualization filenames

    Returns:
        Tool execution results
    """
    if tool_name == "execute_python":
        return code_interpret(e2b_code_interpreter, tool_input["code"], visualization_counter=visualization_counter)
    return []


def chat_with_claude(e2b_code_interpreter, user_message: str):
    """
    Send a message to Claude and process tool calls in an agentic loop.

    Args:
        e2b_code_interpreter: The E2B sandbox instance
        user_message: Message to send to Claude

    Returns:
        Final response from Claude after processing all tools
    """
    print(f"\n{'='*50}\nUser Message: {user_message}\n{'='*50}")

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    messages = [{"role": "user", "content": user_message}]

    all_tool_results = []
    visualization_counter = {"count": 0}  # Track visualizations across all iterations
    iteration = 0
    max_iterations = 10  # Prevent infinite loops

    # Agentic loop: keep calling Claude until it stops using tools
    while iteration < max_iterations:
        iteration += 1
        print(f"\n--- Iteration {iteration} ---")

        message = client.messages.create(
            model=MODEL_NAME,
            system=SYSTEM_PROMPT,
            messages=messages,
            max_tokens=4096,
            tools=tools,
        )

        print(f"Stop Reason: {message.stop_reason}")

        # Check if Claude wants to use a tool
        if message.stop_reason == "tool_use":
            # Extract all tool uses from this response
            tool_uses = [block for block in message.content if block.type == "tool_use"]

            # Add assistant message to conversation
            messages.append({"role": "assistant", "content": message.content})

            # Process each tool use
            tool_results_content = []
            for tool_use in tool_uses:
                tool_name = tool_use.name
                tool_input = tool_use.input

                print(f"\nTool Used: {tool_name}")
                print(f"Tool Input (truncated): {str(tool_input)[:200]}...")

                # Execute the tool
                result = process_tool_call(
                    e2b_code_interpreter,
                    tool_name,
                    tool_input,
                    visualization_counter
                )

                print(f"Tool Result (truncated): {str(result)[:200]}...")
                all_tool_results.append(result)

                # Add tool result to response
                tool_results_content.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": str(result)
                })

            # Send all tool results back to Claude
            messages.append({
                "role": "user",
                "content": tool_results_content
            })

        else:
            # Claude is done using tools, extract final response
            print(f"\n{'='*50}")
            print("Claude finished processing")
            print(f"{'='*50}")

            final_text = ""
            for block in message.content:
                if hasattr(block, 'text'):
                    final_text += block.text

            if final_text:
                print(f"\n{final_text}")

            return {
                "tool_results": all_tool_results,
                "final_response": final_text
            }

    # Max iterations reached
    print("\nWarning: Maximum iterations reached")
    return {
        "tool_results": all_tool_results,
        "final_response": "Maximum iterations reached without final response"
    }


def main():
    """
    Main function to orchestrate the website topic visualization.
    """
    # Validate API keys
    if not all([ANTHROPIC_API_KEY, FIRECRAWL_API_KEY, E2B_API_KEY]):
        print("Error: Missing required API keys. Please check your .env file.")
        print("Required keys: ANTHROPIC_API_KEY, FIRECRAWL_API_KEY, E2B_API_KEY")
        return

    # Crawl the website
    crawl_url = 'https://python.langchain.com/docs/introduction/'
    cleaned_crawl_result = crawl_website(crawl_url, limit=5)

    # Use E2B Code Interpreter to analyze and visualize topics
    with Sandbox.create() as code_interpreter:
        result = chat_with_claude(
            code_interpreter,
            "Use python to identify the most common topics in the crawl results. "
            "For each topic, count the number of times it appears in the crawl results and plot them. "
            f"Here is the crawl results: {str(cleaned_crawl_result)[:1024]}"
        )

        print("\n" + "="*50)
        print("FINAL RESULT")
        print("="*50)
        if "final_response" in result:
            print(result["final_response"])
        if "tool_results" in result:
            print(f"\nTool execution completed with {len(result['tool_results'])} result(s)")
        print("="*50)


if __name__ == "__main__":
    main()
