"""
Shared type definitions for NotebookLM Fixer
"""
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID


class ProjectStatus(str, Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    EXPORTING = "exporting"
    COMPLETED = "completed"
    FAILED = "failed"


class OCRStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class IssueType(str, Enum):
    LOW_CONFIDENCE = "low_confidence"
    GARBLED = "garbled"
    MISSING = "missing"
    MANUAL = "manual"


class IssueStatus(str, Enum):
    DETECTED = "detected"
    REVIEWING = "reviewing"
    CORRECTED = "corrected"
    SKIPPED = "skipped"


class CorrectionMethod(str, Enum):
    TEXT_OVERLAY = "text_overlay"
    NANO_BANANA = "nano_banana"


class ExportType(str, Enum):
    PDF = "pdf"
    PPTX = "pptx"


class ExportStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# Pydantic Models
class BBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class OCRWord(BaseModel):
    text: str
    bbox: BBox
    confidence: float


class OCRBlock(BaseModel):
    text: str
    bbox: BBox
    confidence: float
    words: List[OCRWord]


class OCRResult(BaseModel):
    full_text: str
    blocks: List[OCRBlock]


class IssueCandidate(BaseModel):
    text: str
    confidence: float
    reason: str


class ProjectCreate(BaseModel):
    name: str


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    original_filename: str
    total_pages: int
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PageResponse(BaseModel):
    id: UUID
    page_number: int
    image_url: str
    thumbnail_url: str
    width: int
    height: int
    ocr_status: OCRStatus
    issue_count: Optional[int] = 0

    class Config:
        from_attributes = True


class IssueResponse(BaseModel):
    id: UUID
    page_id: UUID
    page_number: int
    bbox: BBox
    issue_type: IssueType
    confidence: Optional[float]
    ocr_text: Optional[str]
    detected_problems: List[str]
    status: IssueStatus
    auto_correctable: bool
    candidates: Optional[List[IssueCandidate]] = None

    class Config:
        from_attributes = True


class CorrectionRequest(BaseModel):
    issue_id: UUID
    method: CorrectionMethod
    selected_text: Optional[str] = None
    selected_candidate_index: Optional[int] = None


class CorrectionResponse(BaseModel):
    id: UUID
    issue_id: UUID
    correction_method: CorrectionMethod
    original_text: Optional[str]
    corrected_text: Optional[str]
    applied: bool
    applied_at: Optional[datetime]

    class Config:
        from_attributes = True


class ExportRequest(BaseModel):
    export_type: ExportType


class ExportResponse(BaseModel):
    id: UUID
    project_id: UUID
    export_type: ExportType
    status: ExportStatus
    file_url: Optional[str] = None

    class Config:
        from_attributes = True


class JobStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: Optional[float] = None
    result: Optional[dict] = None
    error: Optional[str] = None
