#!/bin/bash
set -e

echo "After Install: Installing dependencies"

cd /home/ec2-user/app

# .env 파일 확인
if [ -f .env ]; then
    echo ".env file found in deployment package"
else
    echo "WARNING: .env file not found!"
fi

# Yarn 설치 확인
if ! command -v yarn &> /dev/null; then
    echo "Installing Yarn..."
    npm install -g yarn
fi

# 의존성 설치
echo "Running yarn install..."
yarn install --production

echo "After Install completed"
