import asyncio
import os
import uuid
import signal
import json
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configuration
FRONTEND_URL = "http://localhost:3000"
TERMINAL_COLS = "120"
TERMINAL_ROWS = "30"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: Dict[str, dict] = {}
session_counter = 0


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up all sessions on server shutdown."""
    for session_id in list(sessions.keys()):
        await cleanup_session(sessions[session_id])
    sessions.clear()


class Session(BaseModel):
    name: str


class ThemeRequest(BaseModel):
    theme: str


async def create_kiro_process():
    """Create a Kiro CLI process with proper terminal environment."""
    env = os.environ.copy()
    env['COLUMNS'] = TERMINAL_COLS
    env['LINES'] = TERMINAL_ROWS
    
    # Set working directory to ~/repo/ae
    cwd = os.path.expanduser('~/repo/ae')
    
    return await asyncio.create_subprocess_exec(
        "kiro-cli", "chat",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        env=env,
        cwd=cwd
    )


async def cleanup_session(session: dict):
    """Clean up session resources."""
    for ws in session.get("websockets", []):
        try:
            await ws.close()
        except:
            pass
    
    if session.get("output_task"):
        session["output_task"].cancel()
    
    if session["process"]:
        try:
            session["process"].terminate()
            await session["process"].wait()
        except:
            pass


@app.get("/sessions")
async def get_sessions():
    return [{"id": sid, "name": s["name"]} for sid, s in sessions.items()]


@app.post("/sessions")
async def create_session(session: Session):
    global session_counter
    session_counter += 1
    session_id = str(uuid.uuid4())
    
    # Use counter for default name if not provided or if it's a default name
    name = session.name if session.name and not session.name.startswith("Session ") else f"Session {session_counter}"
    
    try:
        process = await create_kiro_process()
    except FileNotFoundError:
        return {"error": "kiro-cli not found in PATH"}
    
    sessions[session_id] = {
        "name": name,
        "process": process,
        "history": [],
        "websockets": [],
        "output_task": None
    }
    return {"id": session_id, "name": name}


@app.put("/sessions/{session_id}")
async def update_session(session_id: str, session: Session):
    if session_id in sessions:
        sessions[session_id]["name"] = session.name
        return {"id": session_id, "name": session.name}
    return {"error": "Session not found"}
async def delete_session(session_id: str):
    if session_id in sessions:
        await cleanup_session(sessions[session_id])
        del sessions[session_id]
    return {"status": "deleted"}


@app.get("/agents")
async def get_agents():
    """Get list of available agents from ~/.kiro/agents."""
    try:
        agents_dir = os.path.expanduser('~/.kiro/agents')
        agents = []
        
        if os.path.exists(agents_dir):
            for filename in os.listdir(agents_dir):
                if filename.endswith('.json') and not filename.endswith('.example'):
                    filepath = os.path.join(agents_dir, filename)
                    try:
                        with open(filepath, 'r') as f:
                            agent_config = json.load(f)
                            agents.append({
                                "id": filename[:-5],  # Remove .json extension
                                "name": agent_config.get("name", filename[:-5]),
                                "description": agent_config.get("description", ""),
                                "model": agent_config.get("model"),
                                "resources": agent_config.get("resources", []),
                                "tools": agent_config.get("tools", []),
                                "mcpServers": list(agent_config.get("mcpServers", {}).keys())
                            })
                    except Exception as e:
                        # Skip invalid JSON files
                        continue
        
        return agents
    except Exception as e:
        return []


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
                for ws in session["websockets"][:]:  # Copy list to avoid modification during iteration
                    try:
                        await ws.send_json({"type": "output", "content": text})
                    except:
                        pass
        except Exception as e:
            error_msg = str(e)
            # Only log non-concurrent read errors
            if "already waiting" not in error_msg:
                for ws in session["websockets"][:]:
                    try:
                        await ws.send_json({"type": "error", "content": error_msg})
                    except:
                        pass
    
    # Only start reading if not already reading
    if session.get("output_task") is None or session["output_task"].done():
        session["output_task"] = asyncio.create_task(read_output())
    
    try:
        while True:
            data = await websocket.receive_json()
            if data["type"] == "input":
                message = data["content"] + "\n"
                # Store user input in history
                user_display = f'\r\n\x1b[36m─────────────────────────────────────────────────────────────────────────────────\x1b[0m\r\n\x1b[1;36mUser:\x1b[0m {data["content"]}\r\n\x1b[36m─────────────────────────────────────────────────────────────────────────────────\x1b[0m\r\n'
                session["history"].append(user_display)
                # Send to Kiro process
                process.stdin.write(message.encode())
                await process.stdin.drain()
    except WebSocketDisconnect:
        pass
    finally:
        # Remove this websocket from the session
        if websocket in session["websockets"]:
            session["websockets"].remove(websocket)
