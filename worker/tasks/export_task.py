"""
Export Celery Tasks
"""
from worker.celery_app import app
import sys
import os
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@app.task(bind=True, max_retries=2)
def export_project_pdf_task(self, project_id: str, export_id: str = None):
    """
    Export project as PDF

    Args:
        project_id: UUID of the project
        export_id: UUID of the export record (optional)
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Project, Export
    from backend.services import export_project_pdf

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return {"status": "error", "message": "Project not found"}

        # Get or create export record
        if export_id:
            export = db.query(Export).filter(Export.id == export_id).first()
        else:
            export = Export(
                id=uuid.uuid4(),
                project_id=project.id,
                export_type="pdf",
                status="processing"
            )
            db.add(export)
            db.commit()
            db.refresh(export)

        export.status = "processing"
        db.commit()

        try:
            file_path = export_project_pdf(uuid.UUID(project_id), db)
            export.file_path = file_path
            export.status = "completed"
            db.commit()

            return {
                "status": "success",
                "export_id": str(export.id),
                "file_path": file_path
            }

        except Exception as e:
            export.status = "failed"
            db.commit()
            return {"status": "error", "message": str(e)}

    finally:
        db.close()


@app.task(bind=True, max_retries=2)
def export_project_pptx_task(self, project_id: str, export_id: str = None):
    """
    Export project as PPTX

    Args:
        project_id: UUID of the project
        export_id: UUID of the export record (optional)
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Project, Export
    from backend.services import export_project_pptx

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return {"status": "error", "message": "Project not found"}

        # Get or create export record
        if export_id:
            export = db.query(Export).filter(Export.id == export_id).first()
        else:
            export = Export(
                id=uuid.uuid4(),
                project_id=project.id,
                export_type="pptx",
                status="processing"
            )
            db.add(export)
            db.commit()
            db.refresh(export)

        export.status = "processing"
        db.commit()

        try:
            file_path = export_project_pptx(uuid.UUID(project_id), db)
            export.file_path = file_path
            export.status = "completed"
            db.commit()

            return {
                "status": "success",
                "export_id": str(export.id),
                "file_path": file_path
            }

        except Exception as e:
            export.status = "failed"
            db.commit()
            return {"status": "error", "message": str(e)}

    finally:
        db.close()
