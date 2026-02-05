"""
OCR Celery Tasks
"""
from worker.celery_app import app
from celery import shared_task
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@app.task(bind=True, max_retries=3)
def process_page_ocr(self, page_id: str):
    """
    Process OCR for a single page

    Args:
        page_id: UUID of the page to process
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Page, Issue
    from backend.services import ocr_page, detect_issues

    db = SessionLocal()
    try:
        page = db.query(Page).filter(Page.id == page_id).first()

        if not page:
            return {"status": "error", "message": "Page not found"}

        # Update status
        page.ocr_status = "processing"
        db.commit()

        try:
            # Run OCR
            ocr_result = ocr_page(page.image_path)

            # Save OCR result
            page.ocr_result = ocr_result
            page.ocr_status = "completed"

            # Detect issues
            issues = detect_issues(ocr_result, str(page.id))

            # Save issues
            for issue_data in issues:
                issue = Issue(**issue_data)
                db.add(issue)

            db.commit()

            return {
                "status": "success",
                "page_id": str(page.id),
                "issue_count": len(issues)
            }

        except Exception as e:
            page.ocr_status = "failed"
            db.commit()

            # Retry on transient errors
            if "rate" in str(e).lower() or "quota" in str(e).lower():
                raise self.retry(countdown=60, exc=e)

            return {
                "status": "error",
                "message": str(e)
            }

    finally:
        db.close()


@app.task(bind=True, max_retries=3)
def process_project_ocr(self, project_id: str):
    """
    Process OCR for all pages in a project

    Args:
        project_id: UUID of the project
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Project, Page

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return {"status": "error", "message": "Project not found"}

        # Get all pages
        pages = db.query(Page).filter(
            Page.project_id == project_id
        ).order_by(Page.page_number).all()

        # Queue OCR for each page
        results = []
        for page in pages:
            task = process_page_ocr.delay(str(page.id))
            results.append({
                "page_number": page.page_number,
                "task_id": task.id
            })

        # Update project status
        project.status = "processing"
        db.commit()

        return {
            "status": "queued",
            "project_id": project_id,
            "pages_queued": len(results),
            "tasks": results
        }

    finally:
        db.close()


@app.task
def check_project_ocr_complete(project_id: str):
    """
    Check if all pages in a project have completed OCR
    and update project status accordingly

    Args:
        project_id: UUID of the project
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Project, Page

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return {"status": "error", "message": "Project not found"}

        pages = db.query(Page).filter(Page.project_id == project_id).all()

        completed = sum(1 for p in pages if p.ocr_status == "completed")
        failed = sum(1 for p in pages if p.ocr_status == "failed")
        pending = sum(1 for p in pages if p.ocr_status in ["pending", "processing"])

        if pending == 0:
            if failed == 0:
                project.status = "ready"
            else:
                project.status = "ready"  # Still ready, just some pages failed

            db.commit()

        return {
            "project_id": project_id,
            "completed": completed,
            "failed": failed,
            "pending": pending,
            "project_status": project.status
        }

    finally:
        db.close()
