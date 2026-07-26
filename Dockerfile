FROM python:3.12-slim

# Unbuffered so `docker logs` shows output as it happens rather than in
# bursts once the buffer fills — the bot's logs are how it is monitored.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# The search index lives here. It is a rebuildable cache, but keeping it
# on a volume saves re-reading every diary file from GitHub on restart.
RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app/data
USER appuser

CMD ["python", "-m", "app.main"]
