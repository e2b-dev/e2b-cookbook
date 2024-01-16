import os
import re
import uuid
from datetime import timedelta, datetime, timezone
from typing import List, Optional

import uvicorn
from e2b import Sandbox
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.requests import Request
from fastapi.responses import StreamingResponse, JSONResponse
from llama_index.chat_engine.types import BaseChatEngine
from llama_index.llms.base import ChatMessage
from llama_index.llms.types import MessageRole
from pydantic import BaseModel

from app.context import system_prompt
from app.db.client import supabase, SUPABASE_KEY, SUPABASE_URL
from app.engine.index import get_chat_engine


app = FastAPI()


RECONNECT_TIMEOUT = 60 * 10  # 10 minutes

code_block_start_regex = re.compile(
    r'```python {"id": "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"}',
    re.I,
)


class _Message(BaseModel):
    role: MessageRole
    content: str


class _ChatData(BaseModel):
    messages: List[_Message]


def _get_sandbox(chat_id: str) -> Sandbox:
    results = supabase.table("sandboxes").select("*").eq("chat_id", chat_id).execute()

    if len(results.data) > 0 and datetime.fromisoformat(
        results.data[0]["expected_to_end_at"]
    ) > datetime.now(timezone.utc):
        sandbox = Sandbox.reconnect(sandbox_id=results.data[0]["id"])
    else:
        sandbox = Sandbox(template="code-interpreter-llama-index")

    sandbox.env_vars = {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_KEY": SUPABASE_KEY,
    }
    sandbox.cwd = "/home/user"

    return sandbox


def run_code(chat_id: str, code_id: str, code: str):
    script_name = f"script-{code_id}.py"

    sandbox = _get_sandbox(chat_id)
    sandbox.filesystem.write(f"/home/user/{script_name}", code)
    supabase.table("sandboxes").upsert(
        {
            "chat_id": chat_id,
            "id": sandbox.id,
            "expected_to_end_at": (
                datetime.now(timezone.utc) + timedelta(seconds=RECONNECT_TIMEOUT)
            ).isoformat(),
        }
    ).execute()
    sandbox.keep_alive(RECONNECT_TIMEOUT)
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
        data.token = data.token.replace("\n", "") + f' {{"id": "{data.code_id}"}}\n'
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


@app.get("/chats/{chat_id}/upload_url")
def get_upload_url(
    request: Request,
    chat_id: str,
) -> JSONResponse:
    sandbox = _get_sandbox(chat_id)
    return JSONResponse({"upload_url": sandbox.file_url()})


@app.get("/chats/{chat_id}/codes/{code_id}")
async def code_result(
    request: Request,
    chat_id: str,
    code_id: str,
) -> JSONResponse:
    if code_id is None:
        raise ValueError("No code id provided")

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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code not found",
        )

    return JSONResponse({"result": response.data[0]["stdout"]})


@app.post("/chats/{chat_id}")
async def chat(
    request: Request,
    data: _ChatData,
    chat_id: str,
    chat_engine: BaseChatEngine = Depends(get_chat_engine),
) -> StreamingResponse:
    # check preconditions and get last message
    if len(data.messages) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No messages provided",
        )

    last_message = data.messages.pop()
    if last_message.role != MessageRole.USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Last message must be from user",
        )

    # convert messages coming from the request to type ChatMessage
    messages = [ChatMessage(role=MessageRole.SYSTEM, content=system_prompt)] + [
        ChatMessage(
            role=m.role,
            content=code_block_start_regex.sub("```python", m.content).strip(),
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

            yield parsing_data.token

    return StreamingResponse(event_generator(), media_type="text/plain")


def main():
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))

if __name__ == "__main__":
    main()


