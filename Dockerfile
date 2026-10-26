# syntax=docker/dockerfile:1

# 1. Build the React app
FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Python API with its dependencies and the cached data (also the dev image)
FROM python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/app ./app
COPY backend/data ./data
RUN useradd --create-home --uid 1000 appuser
USER appuser

# 3. Test image: `docker build --target test -t wind-test . && docker run --rm wind-test`
FROM backend AS test
USER root
COPY backend/requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
COPY backend/tests ./tests
USER appuser
CMD ["pytest", "-q", "-p", "no:cacheprovider"]

# 4. Runtime: FastAPI serves the API and the built SPA. Heroku injects $PORT.
FROM backend AS runtime
COPY --from=frontend /src/dist ./static
ENV PORT=8000
EXPOSE 8000
# exec so uvicorn is PID 1 and receives SIGTERM from Heroku/Docker for a graceful shutdown
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
