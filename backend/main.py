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


class ThemeRequest(BaseModel):
    theme: str


@app.get("/sessions")
async def get_sessions():
    return [{"id": sid, "name": s["name"]} for sid, s in sessions.items()]


@app.post("/sessions")
async def create_session(session: Session):
    session_id = str(uuid.uuid4())
    
    # Start Kiro process immediately
    try:
        process = await asyncio.create_subprocess_exec(
            "kiro-cli", "chat",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
    except FileNotFoundError:
        return {"error": "kiro-cli not found in PATH"}
    
    sessions[session_id] = {
        "name": session.name,
        "process": process,
        "history": [],
        "websockets": []
    }
    return {"id": session_id, "name": session.name}


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    if session_id in sessions:
        session = sessions[session_id]
        
        # Close all websockets
        for ws in session.get("websockets", []):
            try:
                await ws.close()
            except:
                pass
        
        # Cancel output task
        if session.get("output_task"):
            session["output_task"].cancel()
        
        # Terminate process
        if session["process"]:
            try:
                session["process"].terminate()
                await session["process"].wait()
            except:
                pass
        
        del sessions[session_id]
    return {"status": "deleted"}


@app.post("/theme")
async def set_theme(request: ThemeRequest):
    try:
        process = await asyncio.create_subprocess_exec(
            "kiro-cli", "theme", request.theme,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.wait()
        return {"status": "success", "theme": request.theme}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    if session_id not in sessions:
        await websocket.close()
        return
    
    session = sessions[session_id]
    process = session["process"]
    
    # Add this websocket to the session's list
    session["websockets"].append(websocket)
    
    # Send existing history to new connection
    for msg in session["history"]:
        await websocket.send_json({"type": "output", "content": msg})
    
    async def read_output():
        try:
            while True:
                chunk = await process.stdout.read(1024)
                if not chunk:
                    break
                text = chunk.decode('utf-8', errors='replace')
                session["history"].append(text)
                # Broadcast to all connected websockets
                for ws in session["websockets"]:
                    try:
                        await ws.send_json({"type": "output", "content": text})
                    except:
                        pass
        except Exception as e:
            for ws in session["websockets"]:
                try:
                    await ws.send_json({"type": "error", "content": str(e)})
                except:
                    pass
    
    # Only start reading if not already reading
    if not hasattr(session, "output_task") or session.get("output_task") is None:
        session["output_task"] = asyncio.create_task(read_output())
    
    try:
        while True:
            data = await websocket.receive_json()
            if data["type"] == "input":
                message = data["content"] + "\n"
                process.stdin.write(message.encode())
                await process.stdin.drain()
    except WebSocketDisconnect:
        pass
    finally:
        # Remove this websocket from the session
        if websocket in session["websockets"]:
            session["websockets"].remove(websocket)
