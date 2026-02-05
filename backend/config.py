"""
Application configuration
"""
import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Google Cloud
    google_cloud_project: str = ""
    google_application_credentials: str = ""

    # Gemini
    gemini_api_key: str = ""

    # Storage
    storage_mode: str = "local"  # local | s3 | gcs
    storage_bucket: str = ""
    storage_path: str = "./storage"

    # Database
    database_url: str = "sqlite:///./notebooklm_fixer.db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # App Config
    max_pages_per_project: int = 100
    max_issues_per_page: int = 20
    max_roi_width: int = 500
    max_roi_height: int = 500

    # PDF Processing
    pdf_dpi: int = 300
    thumbnail_width: int = 150

    # ROI Margin for patches
    roi_margin: int = 40

    # Server
    backend_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
