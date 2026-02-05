"""
Pages API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.db import get_db, Page, Project
from backend.storage import storage

router = APIRouter(prefix="/api/projects/{project_id}/pages", tags=["pages"])


@router.get("")
async def list_pages(
    project_id: str,
    db: Session = Depends(get_db)
):
    """
    List all pages for a project with thumbnails and issue counts
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    pages = db.query(Page).filter(
        Page.project_id == project_id
    ).order_by(Page.page_number).all()

    return [
        {
            "id": str(page.id),
            "page_number": page.page_number,
            "thumbnail_url": storage().get_url(page.thumbnail_path),
            "width": page.width,
            "height": page.height,
            "ocr_status": page.ocr_status,
            "issue_count": len(page.issues) if page.issues else 0,
            "has_unresolved_issues": any(
                i.status in ["detected", "reviewing"]
                for i in (page.issues or [])
            )
        }
        for page in pages
    ]


@router.get("/{page_number}")
async def get_page(
    project_id: str,
    page_number: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed page information including OCR result
    """
    page = db.query(Page).filter(
        Page.project_id == project_id,
        Page.page_number == page_number
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Get issues for this page
    issues = [
        {
            "id": str(issue.id),
            "bbox": {
                "x": issue.bbox_x,
                "y": issue.bbox_y,
                "width": issue.bbox_width,
                "height": issue.bbox_height
            },
            "issue_type": issue.issue_type,
            "confidence": issue.confidence,
            "ocr_text": issue.ocr_text,
            "detected_problems": issue.detected_problems,
            "status": issue.status,
            "auto_correctable": issue.auto_correctable
        }
        for issue in (page.issues or [])
    ]

    return {
        "id": str(page.id),
        "page_number": page.page_number,
        "image_url": storage().get_url(page.image_path),
        "thumbnail_url": storage().get_url(page.thumbnail_path),
        "width": page.width,
        "height": page.height,
        "ocr_status": page.ocr_status,
        "ocr_result": page.ocr_result,
        "issues": issues
    }


@router.get("/{page_number}/image")
async def get_page_image(
    project_id: str,
    page_number: int,
    db: Session = Depends(get_db)
):
    """
    Get page image binary
    """
    page = db.query(Page).filter(
        Page.project_id == project_id,
        Page.page_number == page_number
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    try:
        image_bytes = storage().get(page.image_path)
        return Response(
            content=image_bytes,
            media_type="image/png"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load image: {str(e)}")


@router.get("/{page_number}/thumbnail")
async def get_page_thumbnail(
    project_id: str,
    page_number: int,
    db: Session = Depends(get_db)
):
    """
    Get page thumbnail binary
    """
    page = db.query(Page).filter(
        Page.project_id == project_id,
        Page.page_number == page_number
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    try:
        image_bytes = storage().get(page.thumbnail_path)
        return Response(
            content=image_bytes,
            media_type="image/png"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load thumbnail: {str(e)}")


@router.post("/{page_number}/ocr")
async def trigger_page_ocr(
    project_id: str,
    page_number: int,
    db: Session = Depends(get_db)
):
    """
    Manually trigger OCR for a specific page
    """
    page = db.query(Page).filter(
        Page.project_id == project_id,
        Page.page_number == page_number
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Trigger OCR task
    try:
        from worker.tasks.ocr_task import process_page_ocr
        task = process_page_ocr.delay(str(page.id))
        return {"task_id": task.id, "status": "queued"}
    except Exception as e:
        # Celery not available, run synchronously
        from backend.services import ocr_page, detect_issues

        page.ocr_status = "processing"
        db.commit()

        try:
            ocr_result = ocr_page(page.image_path)
            page.ocr_result = ocr_result
            page.ocr_status = "completed"

            # Detect issues
            issues = detect_issues(ocr_result, str(page.id))

            from backend.db import Issue
            for issue_data in issues:
                issue = Issue(**issue_data)
                db.add(issue)

            db.commit()

            return {"status": "completed", "issue_count": len(issues)}

        except Exception as ocr_error:
            page.ocr_status = "failed"
            db.commit()
            raise HTTPException(status_code=500, detail=f"OCR failed: {str(ocr_error)}")
