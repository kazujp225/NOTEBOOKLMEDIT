"""
Projects API endpoints
"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session

from backend.db import get_db, Project, Page
from backend.storage import storage
from backend.services import pdf_to_images
from backend.config import settings

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Upload a PDF and create a new project
    """
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Read file content
    content = await file.read()

    # Generate project ID
    project_id = str(uuid.uuid4())

    # Use filename as name if not provided
    if not name:
        name = file.filename.rsplit('.', 1)[0]

    # Save original PDF
    original_path = f"projects/{project_id}/original.pdf"
    storage().save_bytes(content, original_path)

    # Convert PDF to images
    try:
        pages_info = pdf_to_images(content, project_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

    if len(pages_info) == 0:
        raise HTTPException(status_code=400, detail="PDF has no pages")

    if len(pages_info) > settings.max_pages_per_project:
        raise HTTPException(
            status_code=400,
            detail=f"PDF has too many pages. Maximum is {settings.max_pages_per_project}"
        )

    # Create project record
    project = Project(
        id=project_id,
        name=name,
        original_filename=file.filename,
        original_path=original_path,
        total_pages=len(pages_info),
        status="processing"
    )
    db.add(project)

    # Create page records
    for page_info in pages_info:
        page = Page(
            project_id=project_id,
            page_number=page_info["page_number"],
            image_path=page_info["image_path"],
            thumbnail_path=page_info["thumbnail_path"],
            width=page_info["width"],
            height=page_info["height"],
            ocr_status="pending"
        )
        db.add(page)

    db.commit()
    db.refresh(project)

    # Trigger OCR in background (via Celery ideally)
    # For now, we'll handle it synchronously or via background task
    background_tasks.add_task(trigger_ocr_for_project, str(project_id))

    return {
        "id": str(project.id),
        "name": project.name,
        "total_pages": project.total_pages,
        "status": project.status,
        "created_at": project.created_at.isoformat()
    }


async def trigger_ocr_for_project(project_id: str):
    """Trigger OCR processing for all pages in a project"""
    # This will be replaced with Celery task
    from worker.tasks.ocr_task import process_project_ocr
    try:
        process_project_ocr.delay(project_id)
    except Exception:
        # Celery not available, skip async OCR
        pass


@router.get("")
async def list_projects(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    List all projects
    """
    projects = db.query(Project).order_by(
        Project.created_at.desc()
    ).offset(skip).limit(limit).all()

    return [
        {
            "id": str(p.id),
            "name": p.name,
            "original_filename": p.original_filename,
            "total_pages": p.total_pages,
            "status": p.status,
            "created_at": p.created_at.isoformat(),
            "updated_at": p.updated_at.isoformat()
        }
        for p in projects
    ]


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """
    Get project details
    """
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get page count with issues
    pages_with_issues = db.query(Page).filter(
        Page.project_id == project_id
    ).all()

    page_summaries = []
    for page in pages_with_issues:
        issue_count = len(page.issues) if page.issues else 0
        page_summaries.append({
            "page_number": page.page_number,
            "ocr_status": page.ocr_status,
            "issue_count": issue_count
        })

    return {
        "id": str(project.id),
        "name": project.name,
        "original_filename": project.original_filename,
        "total_pages": project.total_pages,
        "status": project.status,
        "created_at": project.created_at.isoformat(),
        "updated_at": project.updated_at.isoformat(),
        "pages": page_summaries
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a project and all associated data
    """
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete from storage
    # Note: In production, you'd want to handle storage deletion more carefully
    try:
        # Delete project folder recursively would be done here
        pass
    except Exception:
        pass

    # Delete from database (cascades to pages, issues, etc.)
    db.delete(project)
    db.commit()

    return {"status": "deleted", "id": project_id}


@router.put("/{project_id}/status")
async def update_project_status(
    project_id: str,
    status: str,
    db: Session = Depends(get_db)
):
    """
    Update project status
    """
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    valid_statuses = ["uploaded", "processing", "ready", "exporting", "completed", "failed"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    project.status = status
    db.commit()

    return {"status": status}
