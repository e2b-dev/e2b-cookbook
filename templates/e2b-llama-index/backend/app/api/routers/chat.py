import asyncio
import json
import threading
import uuid
from collections import defaultdict
from typing import List, Optional

from e2b import Sandbox, ProcessOutput
from fastapi.responses import StreamingResponse
from llama_index.chat_engine.types import BaseChatEngine
from starlette.responses import JSONResponse

from app.context import system_prompt
from app.db.client import supabase
from app.engine.index import get_chat_engine
from fastapi import APIRouter, Depends, HTTPException, Request, status, WebSocket
from llama_index.llms.base import ChatMessage
from llama_index.llms.types import MessageRole
from pydantic import BaseModel

chat_router = r = APIRouter()


class _Message(BaseModel):
    role: MessageRole
    content: str


class _ChatData(BaseModel):
    messages: List[_Message]


results = defaultdict(dict)


def run_code(chat_id: str, code_id: str, code: str) -> ProcessOutput:
    with Sandbox(cwd="/home/user") as sandbox:
        sandbox.filesystem.write("main.py", code)
        result = sandbox.process.start_and_wait("python3 main.py")

    supabase.table("results").insert(
        {
            "chat_id": chat_id,
            "code_id": code_id,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
        }
    ).execute()

    return result


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
    elif data.line.startswith("```") and not data.line.startswith("````") and data.execute:
        thread = threading.Thread(
            target=run_code,
            args=(data.chat_id, data.code_id, data.codeblock),
            daemon=True,
        )
        thread.start()
        data.execute = False
        data.code_id = None
        data.codeblock = ""

    return data


@r.post("/chats/{chat_id}")
async def chat(
    request: Request,
    data: _ChatData,
    chat_id: str,
    chat_engine: BaseChatEngine = Depends(get_chat_engine),
):
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
            content=m.content,
        )
        for m in data.messages
    ]

    # query chat engine
    response = chat_engine.stream_chat(last_message.content, messages)

    # stream response
    async def event_generator():
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

            # If client closes connection, stop sending events
            if await request.is_disconnected():
                break
            yield parsing_data.token

    return StreamingResponse(event_generator(), media_type="text/plain")


@r.get("/chats/{chat_id}/code/{code_id}")
async def code_result(
    request: Request,
    chat_id: str,
    code_id: str,
):
    response = supabase.table("results").select("*").eq("code_id", code_id).eq("chat_id", chat_id).limit(1).execute()

    if len(response.data) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Code not found",
        )

    return JSONResponse({"result": response.data[0]["stdout"]})
