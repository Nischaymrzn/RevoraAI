FROM python:3.11-slim

WORKDIR /app

# Flush Python stdout/stderr immediately so background-task print() calls
# appear in Render's log stream in real time (no buffering)
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000

EXPOSE ${PORT}

CMD python migrate.py && uvicorn main:app --host 0.0.0.0 --port ${PORT}
