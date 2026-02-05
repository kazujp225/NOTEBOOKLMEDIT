"""
Issue Detection Celery Tasks
"""
from worker.celery_app import app
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@app.task(bind=True, max_retries=3)
def detect_page_issues(self, page_id: str):
    """
    Detect issues in a page's OCR result

    Args:
        page_id: UUID of the page
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Page, Issue
    from backend.services import detect_issues, merge_nearby_issues

    db = SessionLocal()
    try:
        page = db.query(Page).filter(Page.id == page_id).first()

        if not page:
            return {"status": "error", "message": "Page not found"}

        if not page.ocr_result:
            return {"status": "error", "message": "No OCR result available"}

        # Clear existing issues
        db.query(Issue).filter(Issue.page_id == page_id).delete()

        # Detect issues
        issues = detect_issues(page.ocr_result, str(page.id))

        # Merge nearby issues
        issues = merge_nearby_issues(issues)

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
        return {"status": "error", "message": str(e)}

    finally:
        db.close()


@app.task
def detect_project_issues(project_id: str):
    """
    Detect issues for all pages in a project

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

        pages = db.query(Page).filter(
            Page.project_id == project_id,
            Page.ocr_status == "completed"
        ).all()

        results = []
        for page in pages:
            task = detect_page_issues.delay(str(page.id))
            results.append({
                "page_number": page.page_number,
                "task_id": task.id
            })

        return {
            "status": "queued",
            "project_id": project_id,
            "pages_queued": len(results),
            "tasks": results
        }

    finally:
        db.close()
