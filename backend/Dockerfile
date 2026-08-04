FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# scripts/ is included so `create_hr_user.py` can be run inside the
# container: docker compose exec backend python scripts/create_hr_user.py <email>
COPY app ./app
COPY scripts ./scripts

# JD PDFs and candidate documents are written under /app/storage --
# docker-compose mounts a named volume here so they survive restarts.
RUN mkdir -p storage

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
