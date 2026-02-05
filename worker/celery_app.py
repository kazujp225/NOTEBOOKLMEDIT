"""
Celery Application Configuration
"""
from celery import Celery
import os

# Get Redis URL from environment
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery(
    "notebooklm_fixer",
    broker=redis_url,
    backend=redis_url,
    include=[
        "worker.tasks.ocr_task",
        "worker.tasks.detection_task",
        "worker.tasks.correction_task",
        "worker.tasks.export_task",
    ]
)

# Celery configuration
app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes max per task
    worker_prefetch_multiplier=1,  # Process one task at a time
    task_acks_late=True,  # Acknowledge after completion
)

# Task routes
app.conf.task_routes = {
    "worker.tasks.ocr_task.*": {"queue": "ocr"},
    "worker.tasks.detection_task.*": {"queue": "detection"},
    "worker.tasks.correction_task.*": {"queue": "correction"},
    "worker.tasks.export_task.*": {"queue": "export"},
}

if __name__ == "__main__":
    app.start()
