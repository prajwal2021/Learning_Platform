FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY seed ./seed
RUN useradd --system --uid 10001 app && chown -R app /srv
USER app
EXPOSE 8000
# Load the content (safe to repeat; progress is never touched), then serve.
CMD ["sh", "-c", "python -m app.cli seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
