FROM ubuntu:24.04
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates \
    && python3 -m venv /opt/server-engine-venv \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN /opt/server-engine-venv/bin/pip install --no-cache-dir .
COPY app ./app
EXPOSE 8000
CMD ["/opt/server-engine-venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
