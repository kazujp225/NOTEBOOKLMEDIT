"""
Correction Celery Tasks
"""
from worker.celery_app import app
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


@app.task(bind=True, max_retries=3)
def generate_issue_candidates(self, issue_id: str):
    """
    Generate correction candidates for an issue using Gemini

    Args:
        issue_id: UUID of the issue
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Issue
    from backend.services import (
        get_gemini_service,
        extract_roi_with_margin,
        get_context_around_bbox,
        evaluate_auto_adopt
    )

    db = SessionLocal()
    try:
        issue = db.query(Issue).filter(Issue.id == issue_id).first()

        if not issue:
            return {"status": "error", "message": "Issue not found"}

        page = issue.page

        # Extract ROI
        bbox = {
            "x": issue.bbox_x,
            "y": issue.bbox_y,
            "width": issue.bbox_width,
            "height": issue.bbox_height
        }

        try:
            roi_bytes, _ = extract_roi_with_margin(page.image_path, bbox)
        except Exception as e:
            return {"status": "error", "message": f"Failed to extract ROI: {str(e)}"}

        # Get context
        context_before = ""
        context_after = ""
        if page.ocr_result:
            context_before, context_after = get_context_around_bbox(
                page.ocr_result,
                bbox
            )

        # Generate candidates
        gemini = get_gemini_service()
        try:
            candidates = gemini.generate_candidates(
                roi_bytes,
                issue.ocr_text or "",
                context_before,
                context_after
            )
        except Exception as e:
            # Retry on rate limit
            if "rate" in str(e).lower() or "quota" in str(e).lower():
                raise self.retry(countdown=60, exc=e)
            return {"status": "error", "message": f"Gemini error: {str(e)}"}

        # Evaluate auto-adopt
        should_auto_adopt, selected_index = evaluate_auto_adopt(
            issue.ocr_text or "",
            candidates,
            issue.confidence or 0.0
        )

        # Save
        issue.candidates = candidates
        issue.auto_correctable = should_auto_adopt
        issue.status = "reviewing"

        db.commit()

        return {
            "status": "success",
            "issue_id": str(issue.id),
            "candidates": candidates,
            "auto_adopt": should_auto_adopt,
            "selected_index": selected_index
        }

    finally:
        db.close()


@app.task(bind=True, max_retries=2)
def apply_issue_correction(
    self,
    issue_id: str,
    corrected_text: str,
    method: str = "text_overlay"
):
    """
    Apply a correction to an issue

    Args:
        issue_id: UUID of the issue
        corrected_text: Corrected text to apply
        method: "text_overlay" or "nano_banana"
    """
    from datetime import datetime
    from backend.db.database import SessionLocal
    from backend.db.models import Issue, Correction
    from backend.services import apply_correction

    db = SessionLocal()
    try:
        issue = db.query(Issue).filter(Issue.id == issue_id).first()

        if not issue:
            return {"status": "error", "message": "Issue not found"}

        page = issue.page
        project_id = str(page.project_id)

        bbox = {
            "x": issue.bbox_x,
            "y": issue.bbox_y,
            "width": issue.bbox_width,
            "height": issue.bbox_height
        }

        try:
            before_path, after_path, status = apply_correction(
                page_image_path=page.image_path,
                issue_bbox=bbox,
                corrected_text=corrected_text,
                original_text=issue.ocr_text or "",
                method=method,
                project_id=project_id,
                issue_id=str(issue.id)
            )
        except Exception as e:
            # Retry on transient errors
            if "rate" in str(e).lower():
                raise self.retry(countdown=30, exc=e)
            return {"status": "error", "message": f"Correction failed: {str(e)}"}

        # Create correction record
        correction = Correction(
            issue_id=issue.id,
            correction_method=method,
            original_text=issue.ocr_text,
            corrected_text=corrected_text,
            candidates=issue.candidates,
            patch_before_path=before_path,
            patch_after_path=after_path,
            applied=True,
            applied_at=datetime.utcnow()
        )
        db.add(correction)

        issue.status = "corrected"
        db.commit()

        return {
            "status": "success",
            "issue_id": str(issue.id),
            "correction_id": str(correction.id),
            "correction_status": status
        }

    finally:
        db.close()


@app.task
def batch_generate_candidates(project_id: str):
    """
    Generate candidates for all detected issues in a project

    Args:
        project_id: UUID of the project
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Project, Page, Issue

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return {"status": "error", "message": "Project not found"}

        # Get all detected issues
        issues = db.query(Issue).join(Page).filter(
            Page.project_id == project_id,
            Issue.status == "detected",
            Issue.candidates.is_(None)
        ).all()

        results = []
        for issue in issues:
            task = generate_issue_candidates.delay(str(issue.id))
            results.append({
                "issue_id": str(issue.id),
                "task_id": task.id
            })

        return {
            "status": "queued",
            "project_id": project_id,
            "issues_queued": len(results),
            "tasks": results
        }

    finally:
        db.close()


@app.task
def batch_auto_correct(project_id: str, method: str = "text_overlay"):
    """
    Auto-correct all auto-correctable issues in a project

    Args:
        project_id: UUID of the project
        method: Correction method to use
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Project, Page, Issue

    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return {"status": "error", "message": "Project not found"}

        # Get all auto-correctable issues with candidates
        issues = db.query(Issue).join(Page).filter(
            Page.project_id == project_id,
            Issue.auto_correctable == True,
            Issue.candidates.isnot(None),
            Issue.status.in_(["detected", "reviewing"])
        ).all()

        results = []
        for issue in issues:
            if issue.candidates and len(issue.candidates) > 0:
                corrected_text = issue.candidates[0]["text"]
                task = apply_issue_correction.delay(
                    str(issue.id),
                    corrected_text,
                    method
                )
                results.append({
                    "issue_id": str(issue.id),
                    "task_id": task.id,
                    "corrected_text": corrected_text
                })

        return {
            "status": "queued",
            "project_id": project_id,
            "corrections_queued": len(results),
            "tasks": results
        }

    finally:
        db.close()
