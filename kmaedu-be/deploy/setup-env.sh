#!/bin/bash
# Setup environment file for Docker deployment
# Run this script before running docker compose

echo "Setting up environment files..."

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SOURCE_ENV="$SCRIPT_DIR/../.env"
TARGET_ENV="$SCRIPT_DIR/.env"

if [ -f "$SOURCE_ENV" ]; then
    cp "$SOURCE_ENV" "$TARGET_ENV"
    echo "✓ Copied .env file to deploy directory"
else
    echo "✗ .env file not found in parent directory"
    echo "Please create .env file from .env.example first"
    exit 1
fi

# Per-service runtime env (deploy/env/<name>.env, gitignored): create the missing ones from the templates.
for example in "$SCRIPT_DIR"/env/*.env.example; do
    target="${example%.example}"
    if [ ! -f "$target" ]; then
        cp "$example" "$target"
        echo "! Created env/$(basename "$target") from its template: fill the empty KEY= lines"
    fi
done

# Render the RabbitMQ users/permissions (definitions.json holds password
# hashes only and is gitignored). Fails fast when a broker password is missing.
if command -v docker >/dev/null 2>&1; then
    (cd "$SCRIPT_DIR" && docker compose run --rm rabbitmq-defs) || {
        echo "✗ Could not render RabbitMQ definitions (see RABBITMQ_*_PASS in .env)"
        exit 1
    }
    echo "✓ Rendered rabbitmq/definitions.json"
else
    echo "! docker not found: run 'docker compose run --rm rabbitmq-defs' before 'up'"
fi

echo ""
echo "You can now run: docker compose up -d --build"
