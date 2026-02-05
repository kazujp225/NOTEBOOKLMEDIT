"""
Corrections API endpoints
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.db import get_db, Issue, Correction, Page
from backend.services import apply_correction, undo_correction

router = APIRouter(prefix="/api/corrections", tags=["corrections"])


class ApplyCorrectionRequest(BaseModel):
    issue_id: str
    method: str = "text_overlay"  # text_overlay | nano_banana
    selected_text: Optional[str] = None
    selected_candidate_index: Optional[int] = None


class UndoCorrectionRequest(BaseModel):
    pass


@router.post("")
async def create_correction(
    request: ApplyCorrectionRequest,
    db: Session = Depends(get_db)
):
    """
    Apply a correction to an issue
    """
    issue = db.query(Issue).filter(Issue.id == request.issue_id).first()

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    page = issue.page
    project_id = str(page.project_id)

    # Determine corrected text
    corrected_text = request.selected_text
    selected_index = request.selected_candidate_index

    if corrected_text is None and selected_index is not None:
        if issue.candidates and 0 <= selected_index < len(issue.candidates):
            corrected_text = issue.candidates[selected_index]["text"]
        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid candidate index"
            )

    if corrected_text is None:
        raise HTTPException(
            status_code=400,
            detail="Must provide either selected_text or selected_candidate_index"
        )

    # Validate method
    if request.method not in ["text_overlay", "nano_banana"]:
        raise HTTPException(
            status_code=400,
            detail="Method must be 'text_overlay' or 'nano_banana'"
        )

    # Prepare bbox
    bbox = {
        "x": issue.bbox_x,
        "y": issue.bbox_y,
        "width": issue.bbox_width,
        "height": issue.bbox_height
    }

    # Apply correction
    try:
        before_path, after_path, status = apply_correction(
            page_image_path=page.image_path,
            issue_bbox=bbox,
            corrected_text=corrected_text,
            original_text=issue.ocr_text or "",
            method=request.method,
            project_id=project_id,
            issue_id=str(issue.id)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply correction: {str(e)}"
        )

    # Create correction record
    correction = Correction(
        issue_id=issue.id,
        correction_method=request.method,
        original_text=issue.ocr_text,
        corrected_text=corrected_text,
        candidates=issue.candidates,
        selected_candidate_index=selected_index,
        patch_before_path=before_path,
        patch_after_path=after_path,
        applied=True,
        applied_at=datetime.utcnow()
    )
    db.add(correction)

    # Update issue status
    issue.status = "corrected"

    db.commit()
    db.refresh(correction)

    return {
        "id": str(correction.id),
        "issue_id": str(issue.id),
        "method": correction.correction_method,
        "original_text": correction.original_text,
        "corrected_text": correction.corrected_text,
        "status": status,
        "applied": True,
        "patch_before_url": f"/api/storage/{before_path}",
        "patch_after_url": f"/api/storage/{after_path}"
    }


@router.post("/{correction_id}/undo")
async def undo_correction_endpoint(
    correction_id: str,
    db: Session = Depends(get_db)
):
    """
    Undo a correction
    """
    correction = db.query(Correction).filter(Correction.id == correction_id).first()

    if not correction:
        raise HTTPException(status_code=404, detail="Correction not found")

    if not correction.applied:
        raise HTTPException(status_code=400, detail="Correction is not currently applied")

    issue = correction.issue
    page = issue.page

    # Get the patch bbox
    bbox = {
        "x": issue.bbox_x,
        "y": issue.bbox_y,
        "width": issue.bbox_width,
        "height": issue.bbox_height
    }

    # Undo the correction
    success = undo_correction(
        page_image_path=page.image_path,
        patch_before_path=correction.patch_before_path,
        patch_bbox=bbox
    )

    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to undo correction"
        )

    # Update records
    correction.applied = False
    issue.status = "reviewing"

    db.commit()

    return {
        "id": str(correction.id),
        "undone": True,
        "issue_status": issue.status
    }


@router.get("/{correction_id}")
async def get_correction(
    correction_id: str,
    db: Session = Depends(get_db)
):
    """
    Get correction details
    """
    correction = db.query(Correction).filter(Correction.id == correction_id).first()

    if not correction:
        raise HTTPException(status_code=404, detail="Correction not found")

    return {
        "id": str(correction.id),
        "issue_id": str(correction.issue_id),
        "method": correction.correction_method,
        "original_text": correction.original_text,
        "corrected_text": correction.corrected_text,
        "candidates": correction.candidates,
        "selected_candidate_index": correction.selected_candidate_index,
        "applied": correction.applied,
        "applied_at": correction.applied_at.isoformat() if correction.applied_at else None,
        "created_at": correction.created_at.isoformat()
    }


@router.get("/issue/{issue_id}/history")
async def get_issue_correction_history(
    issue_id: str,
    db: Session = Depends(get_db)
):
    """
    Get correction history for an issue
    """
    issue = db.query(Issue).filter(Issue.id == issue_id).first()

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    corrections = db.query(Correction).filter(
        Correction.issue_id == issue_id
    ).order_by(Correction.created_at.desc()).all()

    return [
        {
            "id": str(c.id),
            "method": c.correction_method,
            "original_text": c.original_text,
            "corrected_text": c.corrected_text,
            "applied": c.applied,
            "applied_at": c.applied_at.isoformat() if c.applied_at else None,
            "created_at": c.created_at.isoformat()
        }
        for c in corrections
    ]


@router.post("/batch")
async def batch_apply_corrections(
    issue_ids: list[str],
    method: str = "text_overlay",
    db: Session = Depends(get_db)
):
    """
    Batch apply auto-corrections to multiple issues
    Only applies to issues that are auto_correctable with candidates
    """
    results = []

    for issue_id in issue_ids:
        issue = db.query(Issue).filter(Issue.id == issue_id).first()

        if not issue:
            results.append({"issue_id": issue_id, "status": "not_found"})
            continue

        if not issue.auto_correctable:
            results.append({"issue_id": issue_id, "status": "not_auto_correctable"})
            continue

        if not issue.candidates or len(issue.candidates) == 0:
            results.append({"issue_id": issue_id, "status": "no_candidates"})
            continue

        # Apply first candidate
        try:
            page = issue.page
            project_id = str(page.project_id)
            corrected_text = issue.candidates[0]["text"]

            bbox = {
                "x": issue.bbox_x,
                "y": issue.bbox_y,
                "width": issue.bbox_width,
                "height": issue.bbox_height
            }

            before_path, after_path, status = apply_correction(
                page_image_path=page.image_path,
                issue_bbox=bbox,
                corrected_text=corrected_text,
                original_text=issue.ocr_text or "",
                method=method,
                project_id=project_id,
                issue_id=str(issue.id)
            )

            correction = Correction(
                issue_id=issue.id,
                correction_method=method,
                original_text=issue.ocr_text,
                corrected_text=corrected_text,
                candidates=issue.candidates,
                selected_candidate_index=0,
                patch_before_path=before_path,
                patch_after_path=after_path,
                applied=True,
                applied_at=datetime.utcnow()
            )
            db.add(correction)
            issue.status = "corrected"

            results.append({
                "issue_id": issue_id,
                "status": "success",
                "corrected_text": corrected_text
            })

        except Exception as e:
            results.append({
                "issue_id": issue_id,
                "status": "error",
                "error": str(e)
            })

    db.commit()

    return {
        "total": len(issue_ids),
        "success": len([r for r in results if r["status"] == "success"]),
        "results": results
    }
