# syntax=docker/dockerfile:1
#
# One image for local Docker and Vercel's Container Runtime: FastAPI serves the API and the built
# React app on $PORT. Kept slim because Vercel Functions allow 250 MB uncompressed.

# 1. Build the React app
FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Install runtime Python deps into a pip-less venv, then strip test suites.
#    Alpine + musllinux wheels: about 70 MB smaller than python:3.12-slim, with no compilation.
FROM python:3.12-alpine AS pydeps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv --without-pip /opt/venv
COPY backend/requirements.txt /tmp/
RUN pip --python /opt/venv/bin/python install -r /tmp/requirements.txt \
 && cd /opt/venv/lib/python3.12/site-packages \
 && rm -rf pandas/tests numpy/*/tests numpy/_core/tests numpy/tests numpy/f2py numpy/typing/tests \
 && find . -name '*.pyi' -delete

# 3. API image (also used by docker-compose for development)
FROM python:3.12-alpine AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY --from=pydeps /opt/venv /opt/venv
COPY backend/app ./app
COPY backend/data ./data
RUN adduser -D -u 1000 appuser
USER appuser

# 4. Test image: `docker build --target test -t wind-test . && docker run --rm wind-test`
FROM backend AS test
USER root
COPY backend/requirements.txt backend/requirements-dev.txt ./
RUN pip --python /opt/venv/bin/python install --no-cache-dir -r requirements-dev.txt
COPY backend/tests ./tests
USER appuser
CMD ["pytest", "-q", "-p", "no:cacheprovider"]

# 5. Runtime (the default target, used by Vercel)
FROM backend AS runtime
COPY --from=frontend /src/dist ./static
ENV PORT=8000
EXPOSE 8000
# exec so uvicorn is PID 1 and gets SIGTERM on scale-down for a graceful shutdown
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
