from backend.api.projects import router as projects_router
from backend.api.pages import router as pages_router
from backend.api.issues import router as issues_router
from backend.api.corrections import router as corrections_router
from backend.api.exports import router as exports_router

__all__ = [
    "projects_router",
    "pages_router",
    "issues_router",
    "corrections_router",
    "exports_router",
]
