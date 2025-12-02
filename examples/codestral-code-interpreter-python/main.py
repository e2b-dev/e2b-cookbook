"""
Mistral's Codestral with code interpreting and analyzing dataset
Powered by open-source Code Interpreter SDK by E2B

Read more about Mistral's new Codestral model at https://mistral.ai/news/codestral/
E2B's code interpreter SDK quickly creates a secure cloud sandbox powered by Firecracker.
Inside this sandbox is a running Jupyter server that the LLM can use.
"""

import os
import re
from dotenv import load_dotenv
from mistralai import Mistral
from e2b_code_interpreter import Sandbox

# Load environment variables
load_dotenv()

# API Keys
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
E2B_API_KEY = os.getenv("E2B_API_KEY")

if not MISTRAL_API_KEY:
    raise ValueError("MISTRAL_API_KEY environment variable is not set")
if not E2B_API_KEY:
    raise ValueError("E2B_API_KEY environment variable is not set")

# Model configuration
MODEL_NAME = "codestral-latest"

SYSTEM_PROMPT = """You're a python data scientist that is analyzing daily temperature of major cities. You are given tasks to complete and you run Python code to solve them.

Information about the temperature dataset:
- It's in the `/home/user/city_temperature.csv` file
- The CSV file is using `,` as the delimiter
- It has following columns (examples included):
  - `Region`: "North America", "Europe"
  - `Country`: "Iceland"
  - `State`: for example "Texas" but can also be null
  - `City`: "Prague"
  - `Month`: "June"
  - `Day`: 1-31
  - `Year`: 2002
  - `AvgTemperature`: temperature in Celsius, for example 24

Generally, you follow these rules:
- ALWAYS FORMAT YOUR RESPONSE IN MARKDOWN
- ALWAYS RESPOND ONLY WITH CODE IN CODE BLOCK LIKE THIS:
```python
{code}
```
- the python code runs in jupyter notebook.
- every time you generate python, the code is executed in a separate cell. it's okay to multiple calls to `execute_python`.
- when creating visualizations with matplotlib or other libraries, ALWAYS save them to a file at `/home/user/output.png` using plt.savefig('/home/user/output.png', bbox_inches='tight', dpi=300)
- you have access to the internet and can make api requests.
- you also have access to the filesystem and can read/write files.
- you can install any pip package (if it exists) if you need to be running `!pip install {package}`. The usual packages for data analysis are already preinstalled though.
- you can run any python code you want, everything is running in a secure sandbox environment
"""


def match_code_block(llm_response: str) -> str:
    """
    Extract Python code block from LLM response.

    Args:
        llm_response: The response from the LLM containing Python code

    Returns:
        Extracted Python code or empty string if no code block found
    """
    pattern = re.compile(r'```python\n(.*?)\n```', re.DOTALL)
    match = pattern.search(llm_response)
    if match:
        code = match.group(1)
        print(code)
        return code
    return ""


def code_interpret(sandbox, code: str):
    """
    Execute Python code in the E2B sandbox.

    Args:
        sandbox: E2B Sandbox instance
        code: Python code to execute

    Returns:
        Execution results or None if error occurred
    """
    print("Running code interpreter...")
    execution = sandbox.run_code(
        code,
        on_stderr=lambda stderr: print("[Code Interpreter]", stderr),
        on_stdout=lambda stdout: print("[Code Interpreter]", stdout)
    )

    if execution.error:
        print("[Code Interpreter ERROR]", execution.error)
        return None
    else:
        return execution.results


def chat(sandbox, client, user_message: str):
    """
    Send a message to Codestral and execute any Python code in the response.

    Args:
        sandbox: E2B Sandbox instance
        client: Mistral client instance
        user_message: User's message/question

    Returns:
        Code interpreter results or empty list if no code was executed
    """
    print(f"\n{'='*50}\nUser message: {user_message}\n{'='*50}")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message}
    ]

    response = client.chat.complete(
        model=MODEL_NAME,
        messages=messages,
    )

    response_message = response.choices[0].message
    python_code = match_code_block(response_message.content)

    if python_code:
        code_interpreter_results = code_interpret(sandbox, python_code)
        return code_interpreter_results or []
    else:
        print(f"Failed to match any Python code in model's response: {response_message}")
        return []


def upload_dataset(sandbox, file_path: str = "./city_temperature.csv"):
    """
    Upload dataset to the E2B sandbox.

    Args:
        sandbox: E2B Sandbox instance
        file_path: Local path to the dataset file
    """
    print("Uploading dataset to Code Interpreter sandbox...")
    with open(file_path, "rb") as f:
        sandbox.files.write(file_path, f)
    print(f"Uploaded at {file_path}")


def download_file(sandbox, remote_path: str, local_path: str):
    """
    Download a file from the E2B sandbox to local filesystem.

    Args:
        sandbox: E2B Sandbox instance
        remote_path: Path to file in the sandbox
        local_path: Local path where to save the file

    Returns:
        True if file was downloaded successfully, False otherwise
    """
    try:
        print(f"Downloading file from sandbox: {remote_path} -> {local_path}")
        # Read file as bytes for binary files like images
        file_content = sandbox.files.read(remote_path, format='bytes')

        with open(local_path, "wb") as f:
            f.write(file_content)

        print(f"File downloaded successfully: {local_path}")
        return True
    except Exception as e:
        print(f"Failed to download file: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main function to run the code interpreter with Codestral."""
    # Initialize Mistral client
    client = Mistral(api_key=MISTRAL_API_KEY)

    # Create output directory if it doesn't exist
    output_dir = "./output"
    os.makedirs(output_dir, exist_ok=True)

    # Create sandbox and run analysis
    with Sandbox.create() as sandbox:
        # Upload the dataset to the code interpreter sandbox
        upload_dataset(sandbox)

        # Run analysis
        code_results = chat(
            sandbox,
            client,
            "Plot average temperature over the years in Algeria"
        )

        if code_results:
            print("\nAnalysis complete!")
            print(f"Number of results: {len(code_results)}")

            # Download the output file from sandbox
            remote_file = "/home/user/output.png"
            local_file = os.path.join(output_dir, "algeria_temperature_plot.png")

            if download_file(sandbox, remote_file, local_file):
                print(f"\n✓ Visualization saved to: {local_file}")
                return local_file
            else:
                # Fallback: try to get image data from results
                print("\nTrying to extract image from results...")
                first_result = code_results[0]
                print(f"Result type: {type(first_result)}")

                # Try to access image data from result object
                if hasattr(first_result, 'png'):
                    png_data = first_result.png
                    with open(local_file, "wb") as f:
                        if isinstance(png_data, bytes):
                            f.write(png_data)
                        elif isinstance(png_data, str):
                            import base64
                            f.write(base64.b64decode(png_data))
                        else:
                            print(f"Unknown png data type: {type(png_data)}")
                    print(f"✓ Visualization saved to: {local_file}")
                    return local_file

                return first_result
        else:
            raise Exception("No code interpreter results")


if __name__ == "__main__":
    main()
