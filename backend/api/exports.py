"""
Exports API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid

from backend.db import get_db, Project, Export
from backend.storage import storage
from backend.services import export_project_pdf, export_project_pptx

router = APIRouter(prefix="/api", tags=["exports"])


class ExportRequest(BaseModel):
    export_type: str  # pdf | pptx


@router.post("/projects/{project_id}/export/pdf")
async def export_pdf(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Start PDF export for a project
    """
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create export record
    export = Export(
        id=uuid.uuid4(),
        project_id=project.id,
        export_type="pdf",
        status="processing"
    )
    db.add(export)
    db.commit()
    db.refresh(export)

    # Run export in background
    background_tasks.add_task(
        run_pdf_export,
        str(export.id),
        project_id
    )

    return {
        "export_id": str(export.id),
        "status": "processing",
        "export_type": "pdf"
    }


async def run_pdf_export(export_id: str, project_id: str):
    """Background task for PDF export"""
    from backend.db.database import SessionLocal

    db = SessionLocal()
    try:
        export = db.query(Export).filter(Export.id == export_id).first()

        try:
            file_path = export_project_pdf(uuid.UUID(project_id), db)
            export.file_path = file_path
            export.status = "completed"
        except Exception as e:
            export.status = "failed"
            print(f"PDF export error: {e}")

        db.commit()
    finally:
        db.close()


@router.post("/projects/{project_id}/export/pptx")
async def export_pptx(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Start PPTX export for a project
    """
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create export record
    export = Export(
        id=uuid.uuid4(),
        project_id=project.id,
        export_type="pptx",
        status="processing"
    )
    db.add(export)
    db.commit()
    db.refresh(export)

    # Run export in background
    background_tasks.add_task(
        run_pptx_export,
        str(export.id),
        project_id
    )

    return {
        "export_id": str(export.id),
        "status": "processing",
        "export_type": "pptx"
    }


async def run_pptx_export(export_id: str, project_id: str):
    """Background task for PPTX export"""
    from backend.db.database import SessionLocal

    db = SessionLocal()
    try:
        export = db.query(Export).filter(Export.id == export_id).first()

        try:
            file_path = export_project_pptx(uuid.UUID(project_id), db)
            export.file_path = file_path
            export.status = "completed"
        except Exception as e:
            export.status = "failed"
            print(f"PPTX export error: {e}")

        db.commit()
    finally:
        db.close()


@router.get("/exports/{export_id}")
async def get_export_status(
    export_id: str,
    db: Session = Depends(get_db)
):
    """
    Get export status
    """
    export = db.query(Export).filter(Export.id == export_id).first()

    if not export:
        raise HTTPException(status_code=404, detail="Export not found")

    result = {
        "id": str(export.id),
        "project_id": str(export.project_id),
        "export_type": export.export_type,
        "status": export.status,
        "created_at": export.created_at.isoformat()
    }

    if export.status == "completed" and export.file_path:
        result["download_url"] = f"/api/exports/{export_id}/download"

    return result


@router.get("/exports/{export_id}/download")
async def download_export(
    export_id: str,
    db: Session = Depends(get_db)
):
    """
    Download exported file
    """
    export = db.query(Export).filter(Export.id == export_id).first()

    if not export:
        raise HTTPException(status_code=404, detail="Export not found")

    if export.status != "completed":
        raise HTTPException(status_code=400, detail="Export not completed yet")

    if not export.file_path:
        raise HTTPException(status_code=404, detail="Export file not found")

    try:
        file_bytes = storage().get(export.file_path)

        # Determine content type
        if export.export_type == "pdf":
            media_type = "application/pdf"
            filename = f"export_{export_id[:8]}.pdf"
        else:
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            filename = f"export_{export_id[:8]}.pptx"

        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download: {str(e)}")


@router.get("/projects/{project_id}/exports")
async def list_project_exports(
    project_id: str,
    db: Session = Depends(get_db)
):
    """
    List all exports for a project
    """
    project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    exports = db.query(Export).filter(
        Export.project_id == project_id
    ).order_by(Export.created_at.desc()).all()

    return [
        {
            "id": str(e.id),
            "export_type": e.export_type,
            "status": e.status,
            "created_at": e.created_at.isoformat(),
            "download_url": f"/api/exports/{e.id}/download" if e.status == "completed" else None
        }
        for e in exports
    ]
