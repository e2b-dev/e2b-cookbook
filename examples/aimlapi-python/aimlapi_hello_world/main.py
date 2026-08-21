from dotenv import load_dotenv

load_dotenv()

import os
import re
from typing import Optional, Tuple

from openai import OpenAI
from e2b_code_interpreter import Sandbox

# ---------- OpenAI-compatible client (AI/ML API) ----------
client = OpenAI(
    base_url="https://api.aimlapi.com/v1",
    api_key=os.environ["AIML_API_KEY"],
    default_headers={
        "HTTP-Referer": "https://github.com/e2b-dev/e2b-cookbook",
        "X-Title": "e2b-cookbook:aimlapi-python",
    },
)

MODEL_ID = "openai/gpt-5-chat-latest"

# ---------- Prompts ----------
SYSTEM_STRAWBERRY = (
    "You are a helpful assistant that can execute python code in a Jupyter notebook. "
    "Only respond with the code to be executed and nothing else. "
    "Respond with a Python code block in Markdown (```python ... ```)."
)
PROMPT_STRAWBERRY = "Calculate how many r's are in the word 'strawberry'"

SYSTEM_LINEAR = (
    "You're a Python data scientist. You are given tasks to complete and you run Python code to solve them.\n"
    "Information about the csv dataset:\n"
    "- It's in the `/home/user/data.csv` file\n"
    "- The CSV file uses \",\" as the delimiter\n"
    "- It contains statistical country-level data\n"
    "Rules:\n"
    "- ALWAYS FORMAT YOUR RESPONSE IN MARKDOWN\n"
    "- RESPOND ONLY WITH PYTHON CODE INSIDE ```python ... ``` BLOCKS\n"
    "- You can use matplotlib/seaborn/pandas/numpy/etc.\n"
    "- Code is executed in a secure Jupyter-like environment with internet access and preinstalled packages"
)
PROMPT_LINEAR = (
    'Plot a linear regression of "GDP per capita (current US$)" vs '
    '"Life expectancy at birth, total (years)" from the dataset. Drop rows with missing values.'
)


# ---------- Helpers ----------
def extract_python_code(markdown: str) -> Optional[str]:
    """Extract python code from a markdown response with fallbacks."""
    if not markdown:
        return None
    m1 = re.search(r"```python\s*([\s\S]*?)```", markdown, re.IGNORECASE)
    if m1 and m1.group(1):
        return m1.group(1).strip()
    m2 = re.search(r"```\s*([\s\S]*?)```", markdown)
    if m2 and m2.group(1):
        return m2.group(1).strip()
    if any(x in markdown for x in ("import ", "def ", "print(", "len(")):
        return markdown.strip()
    return None


def llm_python_code(system_prompt: str, user_prompt: str) -> str:
    """Ask the model for python code and return extracted code (raises on failure)."""
    try:
        resp = client.chat.completions.create(
            model=MODEL_ID,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as e:
        raise RuntimeError(f"LLM request failed: {e}")

    content = resp.choices[0].message.content if resp and resp.choices else None
    if content is None:
        raise RuntimeError("Model returned null/empty content (possibly filtered). Try adjusting the prompt.")

    code = extract_python_code(content)
    if not code:
        raise RuntimeError("No Python code block found in LLM response.")
    return code


def run_code_in_sandbox(code: str) -> Tuple[str, bytes | None]:
    """
    Execute code in E2B Sandbox.
    Returns (text_output, png_bytes_or_none).
    """
    with Sandbox() as sandbox:
        execution = sandbox.run_code(code)

        # Text output
        text = (execution.text or "").strip()
        if not text and execution.results:
            first = execution.results[0]
            text = str(getattr(first, "text", "") or "").strip()

        # Image (first result png if available)
        png_bytes: bytes | None = None
        if execution.results:
            first = execution.results[0]
            if getattr(first, "png", None):
                import base64
                png_bytes = base64.b64decode(first.png)

        return text, png_bytes


def upload_dataset_if_exists(sandbox: Sandbox, local_path: str = "./data.csv", target_name: str = "data.csv") -> bool:
    """
    Upload local CSV to sandbox home so it's available as /home/user/data.csv.
    Returns True if uploaded, False if file not found.
    """
    if not os.path.exists(local_path):
        return False
    with open(local_path, "rb") as f:
        data = f.read()
    sandbox.files.write(target_name, data)
    return True


# ---------- Tests ----------
def test_strawberry() -> str:
    code = llm_python_code(SYSTEM_STRAWBERRY, PROMPT_STRAWBERRY)
    text, _ = run_code_in_sandbox(code)
    if "3" not in text:
        raise AssertionError(f"Expected '3' in output, got: {text!r}")
    return text


def test_linear_regression(image_out: str = "image_1.png") -> str:
    # Get code first to avoid leaving sandbox running on LLM failure
    code = llm_python_code(SYSTEM_LINEAR, PROMPT_LINEAR)

    with Sandbox() as sandbox:
        uploaded = upload_dataset_if_exists(sandbox, "./data.csv", "data.csv")
        if not uploaded:
            print("⚠️  data.csv not found next to main.py — running anyway, code may fail if it expects the file.")

        execution = sandbox.run_code(code)

        # Text output
        text = (execution.text or "").strip()
        if not text and execution.results:
            first = execution.results[0]
            text = str(getattr(first, "text", "") or "").strip()

        # Image save (if returned)
        if execution.results:
            first = execution.results[0]
            if getattr(first, "png", None):
                import base64
                try:
                    png_bytes = base64.b64decode(first.png)
                    with open(image_out, "wb") as f:
                        f.write(png_bytes)
                    print(f"✅ Image saved as {image_out}")
                except Exception as e:
                    print(f"⚠️ Could not save image: {e}")
            else:
                print("⚠️ No image result returned.")

        return text


# ---------- Entry ----------
def main():
    print("=== Strawberry test ===")
    strawberry_out = test_strawberry()
    print(PROMPT_STRAWBERRY, "->", strawberry_out)

    print("\n=== Linear regression test ===")
    lin_out = test_linear_regression()
    print("Linear regression output:\n", lin_out)


if __name__ == "__main__":
    main()
