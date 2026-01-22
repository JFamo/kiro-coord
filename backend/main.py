import asyncio
import uuid
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: Dict[str, dict] = {}


class Session(BaseModel):
    name: str


@app.get("/sessions")
async def get_sessions():
    return [{"id": sid, "name": s["name"]} for sid, s in sessions.items()]


@app.post("/sessions")
async def create_session(session: Session):
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "name": session.name,
        "process": None,
        "history": []
    }
    return {"id": session_id, "name": session.name}


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    if session_id in sessions:
        if sessions[session_id]["process"]:
            sessions[session_id]["process"].terminate()
        del sessions[session_id]
    return {"status": "deleted"}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    if session_id not in sessions:
        await websocket.close()
        return
    
    process = await asyncio.create_subprocess_exec(
        "kiro-cli", "chat",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    
    sessions[session_id]["process"] = process
    
    async def read_output():
        try:
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                text = line.decode().rstrip()
                sessions[session_id]["history"].append({"role": "assistant", "content": text})
                await websocket.send_json({"type": "output", "content": text})
        except Exception:
            pass
    
    output_task = asyncio.create_task(read_output())
    
    try:
        while True:
            data = await websocket.receive_json()
            if data["type"] == "input":
                message = data["content"] + "\n"
                sessions[session_id]["history"].append({"role": "user", "content": data["content"]})
                process.stdin.write(message.encode())
                await process.stdin.drain()
    except WebSocketDisconnect:
        output_task.cancel()
        process.terminate()
