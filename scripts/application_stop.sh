#!/bin/bash
set -e

echo "Application Stop: Stopping PM2 application"

# PM2 프로세스 확인 및 중지
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "3tier-backend"; then
        echo "Stopping 3tier-backend..."
        pm2 stop 3tier-backend || true
        pm2 delete 3tier-backend || true
    else
        echo "No running 3tier-backend process found"
    fi
else
    echo "PM2 not installed, skipping..."
fi

echo "Application Stop completed"
