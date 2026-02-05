from worker.tasks.ocr_task import process_page_ocr, process_project_ocr, check_project_ocr_complete
from worker.tasks.detection_task import detect_page_issues, detect_project_issues
from worker.tasks.correction_task import (
    generate_issue_candidates,
    apply_issue_correction,
    batch_generate_candidates,
    batch_auto_correct
)
from worker.tasks.export_task import export_project_pdf_task, export_project_pptx_task

__all__ = [
    "process_page_ocr",
    "process_project_ocr",
    "check_project_ocr_complete",
    "detect_page_issues",
    "detect_project_issues",
    "generate_issue_candidates",
    "apply_issue_correction",
    "batch_generate_candidates",
    "batch_auto_correct",
    "export_project_pdf_task",
    "export_project_pptx_task",
]
