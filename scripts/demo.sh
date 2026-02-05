#!/bin/bash

# NotebookLM修正ツール デモスクリプト
# このスクリプトはローカル開発環境でのデモ手順を自動化します

set -e

echo "=================================="
echo "NotebookLM修正ツール デモ"
echo "=================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check environment
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "Please edit .env to add your API keys before continuing."
    exit 1
fi

echo "Step 1: Starting infrastructure services..."
echo "-------------------------------------------"
docker-compose up -d postgres redis
sleep 5

echo ""
echo "Step 2: Starting backend..."
echo "-------------------------------------------"
cd backend
pip install -r requirements.txt --quiet

# Start backend in background
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..
sleep 3

echo ""
echo "Step 3: Starting frontend..."
echo "-------------------------------------------"
cd frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!
cd ..
sleep 5

echo ""
echo "=================================="
echo "Demo environment is ready!"
echo "=================================="
echo ""
echo "Access the application:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Demo steps:"
echo "  1. Open http://localhost:3000"
echo "  2. Upload a PDF with garbled/blurry text"
echo "  3. Wait for OCR and issue detection"
echo "  4. Review and apply corrections"
echo "  5. Export as PDF or PPTX"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker-compose down; exit 0" INT

wait
