# Test image: bash 3.2 (macOS default) + bats + shellcheck + jq + docker CLI/compose (no daemon)
# + openssl (stand-in for the dev image the secret generator runs in).
# Tests run here so bash-4-only syntax fails the same way it would on a stock Mac.
FROM bash:3.2

ARG BATS_VERSION=v1.11.1
ARG BATS_SUPPORT_VERSION=v0.3.0
ARG BATS_ASSERT_VERSION=v2.1.0

RUN apk add --no-cache git curl coreutils shellcheck docker-cli docker-cli-compose openssl jq

RUN git clone --depth 1 --branch "${BATS_VERSION}" https://github.com/bats-core/bats-core.git /tmp/bats-core \
 && /tmp/bats-core/install.sh /usr/local \
 && git clone --depth 1 --branch "${BATS_SUPPORT_VERSION}" https://github.com/bats-core/bats-support.git /usr/local/lib/bats-support \
 && git clone --depth 1 --branch "${BATS_ASSERT_VERSION}" https://github.com/bats-core/bats-assert.git /usr/local/lib/bats-assert \
 && rm -rf /tmp/bats-core

WORKDIR /repo/docker-development
