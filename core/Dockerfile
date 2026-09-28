FROM ubuntu:24.04
WORKDIR /app
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates build-essential cmake golang-go bison autoconf automake patch erlang-nox erlang-dev erlang-src elixir xsltproc xmlto zip unzip xz-utils gettext libcurl4-openssl-dev libexpat1-dev libjpeg-dev libpng-dev libtiff-dev libwebp-dev libheif-dev libxml2-dev libfontconfig1-dev libfreetype6-dev liblqr-1-0-dev libopenjp2-7-dev libraw-dev libtool pkg-config libreadline-dev libyaml-dev libffi-dev libgdbm-dev libncurses-dev libzstd-dev liblz4-dev libaio-dev libsqlite3-dev libevent-dev libpcre2-dev libcap-dev zlib1g-dev libssl-dev \
    && python3 -m venv /opt/server-engine-venv \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
RUN /opt/server-engine-venv/bin/pip install --no-cache-dir .
COPY app ./app
EXPOSE 8000
CMD ["/opt/server-engine-venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
