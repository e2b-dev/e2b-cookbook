import json
import uuid
from typing import List, Optional

from e2b import Sandbox
from llama_index.llms.base import ChatMessage
from llama_index.llms.types import MessageRole
from pydantic import BaseModel

from app.context import system_prompt
from app.db.client import supabase, SUPABASE_KEY, SUPABASE_URL
from app.engine.index import get_chat_engine


chat_engine = get_chat_engine()


class _Message(BaseModel):
    role: MessageRole
    content: str


class _ChatData(BaseModel):
    chat_id: str
    messages: List[_Message]


def run_code(chat_id: str, code_id: str, code: str):
    script_name = f"script-{code_id}.py"
    with Sandbox(
        template="code-interpreter-llama-index",
        cwd="/home/user",
        env_vars={
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_KEY": SUPABASE_KEY,
        },
    ) as sandbox:
        sandbox.filesystem.write(f"/home/user/{script_name}", code)
        sandbox.keep_alive(60)
        sandbox.process.start(
            f"python3 trigger_script.py "
            f"--chat_id {chat_id} "
            f"--code_id {code_id} "
            f"--script_name {script_name}"
        )


class _ParsingData(BaseModel):
    chat_id: str
    line: str
    code_id: Optional[str]
    codeblock: str
    execute: bool
    token: str


def process_line(data: _ParsingData) -> _ParsingData:
    if data.line.startswith("```python"):
        data.code_id = str(uuid.uuid4())
        data.token = data.token + f' {{"id": "{data.code_id}"}}'
        data.line = ""
        data.execute = True
    elif (
        data.line.startswith("```")
        and not data.line.startswith("````")
        and data.execute
    ):
        run_code(data.chat_id, data.code_id, data.codeblock)
        data.execute = False
        data.code_id = None
        data.codeblock = ""

    return data


def chat(
    data: dict,
):
    chat_id = data.get("chat_id", None)
    if chat_id is None:
        raise ValueError("No chat id provided")

    data = _ChatData(**data)
    # check preconditions and get last message
    if len(data.messages) == 0:
        raise ValueError("No messages provided")

    last_message = data.messages.pop()
    if last_message.role != MessageRole.USER:
        raise ValueError("Last message must be from user")

    # convert messages coming from the request to type ChatMessage
    messages = [ChatMessage(role=MessageRole.SYSTEM, content=system_prompt)] + [
        ChatMessage(
            role=m.role,
            content=m.content,
        )
        for m in data.messages
    ]

    # query chat engine
    response = chat_engine.stream_chat(last_message.content, messages)

    # stream response
    def event_generator():
        parsing_data = _ParsingData(
            chat_id=chat_id,
            line="",
            code_id=None,
            codeblock="",
            execute=False,
            token="",
        )

        for token in response.response_gen:
            parsing_data.token = token
            if "\n" in parsing_data.token:
                lines = parsing_data.token.split("\n")
                parsing_data.line += lines[0]

                parsing_data = process_line(parsing_data)

                if parsing_data.code_id:
                    parsing_data.codeblock += parsing_data.line + "\n"

                for li in lines[1:-1]:
                    if parsing_data.code_id:
                        parsing_data.codeblock += li + "\n"

                parsing_data.line = lines[-1]
            else:
                parsing_data.line += token
                parsing_data = process_line(parsing_data)

            yield parsing_data.token

    return "".join(token for token in event_generator())


def code_result(
    body: dict,
) -> str:
    code_id = body.get("code_id", None)
    if code_id is None:
        raise ValueError("No code id provided")

    chat_id = body.get("chat_id", None)
    if chat_id is None:
        raise ValueError("No chat id provided")

    response = (
        supabase.table("results")
        .select("*")
        .eq("code_id", code_id)
        .eq("chat_id", chat_id)
        .limit(1)
        .execute()
    )

    if len(response.data) == 0:
        raise ValueError("Code not found")

    return json.dumps({"result": response.data[0]["stdout"]})


def handler(event, context):
    print("Event: {}".format(event))
    body = json.loads(event.get("body", {}))

    operation = body.pop("operation", None)

    operations = {"chat": chat, "code_result": code_result, "echo": lambda x: x}

    if operation in operations:
        print("Operation: {}".format(operation))
        return operations[operation](body)
    else:
        print("Unrecognized operation: {}".format(operation))
        raise ValueError('Unrecognized operation "{}"'.format(operation))
