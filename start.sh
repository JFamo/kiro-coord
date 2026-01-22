#!/bin/bash
set -e

echo "Setting up Kiro Coordinator..."

# Backend setup
if [ ! -d "backend/venv" ]; then
  echo "Installing backend dependencies..."
  cd backend
  python3 -m venv venv
  source venv/bin/activate
  pip install -q -r requirements.txt
  cd ..
fi

# Frontend setup
if [ ! -d "frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  cd frontend
  npm install
  cd ..
fi

# Start services
echo "Starting backend server..."
cd backend
./venv/bin/uvicorn main:app --reload &
BACKEND_PID=$!
cd ..

sleep 2

echo "Starting frontend..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "✓ Backend running on http://localhost:8000"
echo "✓ Frontend running on http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

wait
