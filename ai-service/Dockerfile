# Build stage
FROM python:3.12-slim AS build

WORKDIR /app

# Install system dependencies needed for compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ============================================================================
# Development stage
# ============================================================================
FROM python:3.12-slim AS development

WORKDIR /app

COPY --from=build /install /usr/local
COPY . .

# Install LibreOffice headless for DOCX → PDF conversion (per SKILL.md §3)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libreoffice-core libreoffice-writer && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ============================================================================
# Production stage — small, non-root image
# ============================================================================
FROM python:3.12-slim AS production

# Security: create non-root user
RUN groupadd -r appgroup && \
    useradd -r -g appgroup -d /app -s /sbin/nologin appuser

WORKDIR /app

# Install LibreOffice headless (required for DOCX→PDF conversion)
RUN apt-get update && \
    apt-get install -y --no-install-recommends libreoffice-core libreoffice-writer curl && \
    rm -rf /var/lib/apt/lists/*

# Copy only installed packages from build stage
COPY --from=build /install /usr/local

# Copy application code
COPY app/ ./app/

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
