"""
Issues API endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.db import get_db, Issue, Page, Project
from backend.storage import storage
from backend.services import (
    get_gemini_service,
    extract_roi_with_margin,
    get_context_around_bbox,
    evaluate_auto_adopt
)

router = APIRouter(prefix="/api", tags=["issues"])


class GenerateCandidatesRequest(BaseModel):
    force_regenerate: bool = False


class UpdateStatusRequest(BaseModel):
    status: str


class CreateIssueRequest(BaseModel):
    page_number: int
    bbox_x: int
    bbox_y: int
    bbox_width: int
    bbox_height: int
    ocr_text: str = ""
    issue_type: str = "manual"


@router.post("/projects/{project_id}/issues")
async def create_issue(
    project_id: str,
    request: CreateIssueRequest,
    db: Session = Depends(get_db)
):
    """
    Create a new issue manually
    """
    import uuid

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Find the page
    page = db.query(Page).filter(
        Page.project_id == project_id,
        Page.page_number == request.page_number
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Create the issue
    issue = Issue(
        id=str(uuid.uuid4()),
        page_id=page.id,
        bbox_x=request.bbox_x,
        bbox_y=request.bbox_y,
        bbox_width=request.bbox_width,
        bbox_height=request.bbox_height,
        issue_type=request.issue_type,
        ocr_text=request.ocr_text,
        detected_problems=[],
        status="detected",
        auto_correctable=False,
        confidence=None
    )

    db.add(issue)
    db.commit()
    db.refresh(issue)

    return {
        "id": str(issue.id),
        "page_id": str(issue.page_id),
        "page_number": page.page_number,
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
        "auto_correctable": issue.auto_correctable,
        "has_candidates": False
    }


@router.get("/projects/{project_id}/issues")
async def list_project_issues(
    project_id: str,
    status: Optional[str] = None,
    page_number: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    List all issues for a project, optionally filtered by status or page
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = db.query(Issue).join(Page).filter(Page.project_id == project_id)

    if status:
        query = query.filter(Issue.status == status)

    if page_number:
        query = query.filter(Page.page_number == page_number)

    issues = query.order_by(Page.page_number, Issue.bbox_y).all()

    return [
        {
            "id": str(issue.id),
            "page_id": str(issue.page_id),
            "page_number": issue.page.page_number,
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
            "auto_correctable": issue.auto_correctable,
            "has_candidates": issue.candidates is not None
        }
        for issue in issues
    ]


@router.get("/issues/{issue_id}")
async def get_issue(
    issue_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed issue information including candidates
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Get ROI image URL
    page = issue.page
    bbox = {
        "x": issue.bbox_x,
        "y": issue.bbox_y,
        "width": issue.bbox_width,
        "height": issue.bbox_height
    }

    return {
        "id": str(issue.id),
        "page_id": str(issue.page_id),
        "page_number": page.page_number,
        "bbox": bbox,
        "issue_type": issue.issue_type,
        "confidence": issue.confidence,
        "ocr_text": issue.ocr_text,
        "detected_problems": issue.detected_problems,
        "status": issue.status,
        "auto_correctable": issue.auto_correctable,
        "candidates": issue.candidates,
        "page_image_url": storage().get_url(page.image_path),
        "corrections": [
            {
                "id": str(c.id),
                "method": c.correction_method,
                "original_text": c.original_text,
                "corrected_text": c.corrected_text,
                "applied": c.applied,
                "applied_at": c.applied_at.isoformat() if c.applied_at else None
            }
            for c in (issue.corrections or [])
        ]
    }


@router.post("/issues/{issue_id}/generate-candidates")
async def generate_candidates(
    issue_id: str,
    request: GenerateCandidatesRequest = GenerateCandidatesRequest(),
    db: Session = Depends(get_db)
):
    """
    Generate correction candidates using Gemini
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Check if candidates already exist
    if issue.candidates and not request.force_regenerate:
        return {
            "candidates": issue.candidates,
            "auto_adopt": issue.auto_correctable,
            "from_cache": True
        }

    page = issue.page

    # Extract ROI with margin
    bbox = {
        "x": issue.bbox_x,
        "y": issue.bbox_y,
        "width": issue.bbox_width,
        "height": issue.bbox_height
    }

    try:
        roi_bytes, _ = extract_roi_with_margin(page.image_path, bbox)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract ROI: {str(e)}")

    # Get context from OCR result
    context_before = ""
    context_after = ""
    if page.ocr_result:
        context_before, context_after = get_context_around_bbox(
            page.ocr_result,
            bbox
        )

    # Generate candidates using Gemini
    gemini = get_gemini_service()
    candidates = gemini.generate_candidates(
        roi_bytes,
        issue.ocr_text or "",
        context_before,
        context_after
    )

    # Evaluate auto-adopt
    should_auto_adopt, selected_index = evaluate_auto_adopt(
        issue.ocr_text or "",
        candidates,
        issue.confidence or 0.0
    )

    # Save candidates
    issue.candidates = candidates
    issue.auto_correctable = should_auto_adopt
    if should_auto_adopt:
        issue.status = "reviewing"  # Ready for auto-correction

    db.commit()

    return {
        "candidates": candidates,
        "auto_adopt": should_auto_adopt,
        "selected_index": selected_index,
        "from_cache": False
    }


@router.put("/issues/{issue_id}/status")
async def update_issue_status(
    issue_id: str,
    request: UpdateStatusRequest,
    db: Session = Depends(get_db)
):
    """
    Update issue status
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    valid_statuses = ["detected", "reviewing", "corrected", "skipped"]
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )

    issue.status = request.status
    db.commit()

    return {"status": request.status}


@router.get("/issues/{issue_id}/roi")
async def get_issue_roi(
    issue_id: str,
    margin: int = 40,
    db: Session = Depends(get_db)
):
    """
    Get ROI image for an issue
    """
    from fastapi.responses import Response

    issue = db.query(Issue).filter(Issue.id == issue_id).first()

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    page = issue.page
    bbox = {
        "x": issue.bbox_x,
        "y": issue.bbox_y,
        "width": issue.bbox_width,
        "height": issue.bbox_height
    }

    try:
        roi_bytes, _ = extract_roi_with_margin(page.image_path, bbox, margin)
        return Response(
            content=roi_bytes,
            media_type="image/png"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract ROI: {str(e)}")
