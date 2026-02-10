#!/bin/bash

echo "🚀 Starting Aditor Image Gen (Dev Mode)"
echo ""

# Check if backend dependencies are installed
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd backend && npm install && cd ..
fi

# Check if .env exists
if [ ! -f "backend/.env" ]; then
  echo "⚙️  Creating backend .env..."
  cp backend/.env.example backend/.env
  echo "⚠️  Edit backend/.env with your ComfyUI URL if needed"
fi

# Start backend
echo ""
echo "▶️  Starting backend on port 3001..."
cd backend && npm run dev &
BACKEND_PID=$!

# Wait a moment
sleep 2

# Start simple frontend
echo ""
echo "▶️  Starting frontend on port 3000..."
cd ../frontend-simple && python3 -m http.server 3000 &
FRONTEND_PID=$!

echo ""
echo "✅ Services started!"
echo ""
echo "📡 Backend API: http://localhost:3001"
echo "🎨 Frontend: http://localhost:3000"
echo "🖼️  ComfyUI: http://localhost:8188 (start separately if not running)"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
