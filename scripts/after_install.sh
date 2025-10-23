#!/bin/bash
set -e

echo "After Install: Setting up Zero-Install dependencies"

cd /home/ec2-user/app

# .env 파일 확인
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    exit 1
fi

echo ".env file found in deployment package"

# Zero-Install 캐시 확인
if [ ! -d .yarn/cache ]; then
    echo "Error: .yarn/cache directory not found!"
    echo "Zero-Install dependencies are missing!"
    exit 1
fi

echo ".yarn/cache found - Zero-Install ready"

# Yarn 바이너리 찾기
YARN_BINARY=$(find .yarn/releases -name "yarn-*.cjs" -type f | head -n 1)

if [ -z "$YARN_BINARY" ]; then
    echo "Error: Yarn binary not found in .yarn/releases/"
    exit 1
fi

echo "Found Yarn binary: $YARN_BINARY"

# Yarn 버전 확인
echo "Yarn version:"
node "$YARN_BINARY" --version

# node_modules 생성 (캐시에서만, 네트워크 다운로드 없음)
echo "Setting up node_modules from cache (no network download)..."
node "$YARN_BINARY" install --immutable --immutable-cache

echo "After Install completed - Zero-Install ready"
