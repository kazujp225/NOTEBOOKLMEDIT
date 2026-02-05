FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (same as backend)
COPY ../backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app/worker
COPY ../backend /app/backend
COPY ../shared /app/shared

# Create storage directory
RUN mkdir -p /app/storage

CMD ["celery", "-A", "worker.celery_app", "worker", "--loglevel=info", "-Q", "ocr,detection,correction,export"]
