FROM python:3.12-slim

# Unbuffered so `docker logs` shows output as it happens rather than in
# bursts once the buffer fills — the bot's logs are how it is monitored.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

RUN useradd --create-home --uid 1000 appuser
USER appuser

CMD ["python", "-m", "app.main"]
