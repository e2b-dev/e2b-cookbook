import argparse
import subprocess
import os
from supabase import create_client, Client


url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)


def main():
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument("--chat_id", type=str)
    arg_parser.add_argument("--code_id", type=str)
    arg_parser.add_argument("--script_name", type=str)

    args = arg_parser.parse_args()
    chat_id = args.chat_id
    code_id = args.code_id
    script_name = args.script_name

    try:
        with subprocess.Popen(
            ["python3", script_name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
        ) as process:
            stdout, stderr = process.communicate()
            exit_code = process.returncode
    except Exception as e:
        stderr = str(e)
        stdout = ""
        exit_code = 1

    supabase.table("results").insert(
        {
            "chat_id": chat_id,
            "code_id": code_id,
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": exit_code,
        }
    ).execute()

    os.remove(script_name)


if __name__ == "__main__":
    main()
