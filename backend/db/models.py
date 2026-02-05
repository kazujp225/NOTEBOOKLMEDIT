"""
SQLAlchemy ORM models
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from backend.db.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    original_path = Column(String(500), nullable=False)
    total_pages = Column(Integer, nullable=False)
    status = Column(String(50), default="uploaded")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pages = relationship("Page", back_populates="project", cascade="all, delete-orphan")
    exports = relationship("Export", back_populates="project", cascade="all, delete-orphan")


class Page(Base):
    __tablename__ = "pages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    page_number = Column(Integer, nullable=False)
    image_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    ocr_status = Column(String(50), default="pending")
    ocr_result = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="pages")
    issues = relationship("Issue", back_populates="page", cascade="all, delete-orphan")

    __table_args__ = (
        {"postgresql_partition_by": None},  # Unique constraint handled separately
    )


class Issue(Base):
    __tablename__ = "issues"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    page_id = Column(String(36), ForeignKey("pages.id", ondelete="CASCADE"), nullable=False)
    bbox_x = Column(Integer, nullable=False)
    bbox_y = Column(Integer, nullable=False)
    bbox_width = Column(Integer, nullable=False)
    bbox_height = Column(Integer, nullable=False)
    issue_type = Column(String(50), nullable=False)
    confidence = Column(Float, nullable=True)
    ocr_text = Column(Text, nullable=True)
    detected_problems = Column(JSON, default=[])
    status = Column(String(50), default="detected")
    auto_correctable = Column(Boolean, default=False)
    candidates = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    page = relationship("Page", back_populates="issues")
    corrections = relationship("Correction", back_populates="issue", cascade="all, delete-orphan")


class Correction(Base):
    __tablename__ = "corrections"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    issue_id = Column(String(36), ForeignKey("issues.id", ondelete="CASCADE"), nullable=False)
    correction_method = Column(String(50), nullable=False)
    original_text = Column(Text, nullable=True)
    corrected_text = Column(Text, nullable=True)
    candidates = Column(JSON, nullable=True)
    selected_candidate_index = Column(Integer, nullable=True)
    patch_before_path = Column(String(500), nullable=True)
    patch_after_path = Column(String(500), nullable=True)
    applied = Column(Boolean, default=False)
    applied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    issue = relationship("Issue", back_populates="corrections")


class Export(Base):
    __tablename__ = "exports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    export_type = Column(String(50), nullable=False)
    file_path = Column(String(500), nullable=True)
    status = Column(String(50), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="exports")
