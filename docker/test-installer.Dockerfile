FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip curl util-linux iproute2 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
CMD ["bash", "-lc", "chmod +x ./install.sh && ./install.sh --no-service --yes --prefix /opt/server-engine-test --state-dir /var/lib/server-engine-test --web-port 18888 --api-port 18000 && test -L /opt/server-engine-test/current && test -f /opt/server-engine-test/current/VERSION && test -x /opt/server-engine-test/current/core/run.sh && test -x /opt/server-engine-test/current/web/run.sh && echo 'native installer test passed'"]
