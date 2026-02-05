"""
FastAPI Application Entry Point
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from backend.config import settings
from backend.db import init_db
from backend.storage import storage
from backend.api import (
    projects_router,
    pages_router,
    issues_router,
    corrections_router,
    exports_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    print("Starting NotebookLM Fixer API...")
    init_db()
    print("Database initialized")

    # Ensure storage directories exist
    os.makedirs(settings.storage_path, exist_ok=True)
    print(f"Storage path: {settings.storage_path}")

    yield

    # Shutdown
    print("Shutting down...")


app = FastAPI(
    title="NotebookLM Fixer API",
    description="API for fixing garbled text in PDF documents",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        settings.frontend_url,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(projects_router)
app.include_router(pages_router)
app.include_router(issues_router)
app.include_router(corrections_router)
app.include_router(exports_router)


# Storage file serving endpoint
@app.get("/api/storage/{path:path}")
async def serve_storage_file(path: str):
    """
    Serve files from storage
    """
    try:
        file_bytes = storage().get(path)

        # Determine content type
        if path.endswith('.png'):
            media_type = "image/png"
        elif path.endswith('.jpg') or path.endswith('.jpeg'):
            media_type = "image/jpeg"
        elif path.endswith('.pdf'):
            media_type = "application/pdf"
        elif path.endswith('.pptx'):
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        else:
            media_type = "application/octet-stream"

        return Response(
            content=file_bytes,
            media_type=media_type
        )
    except FileNotFoundError:
        return JSONResponse(
            status_code=404,
            content={"detail": "File not found"}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"detail": str(e)}
        )


# Health check
@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": "1.0.0"
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "NotebookLM Fixer API",
        "version": "1.0.0",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
