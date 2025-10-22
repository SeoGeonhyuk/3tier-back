#!/bin/bash
set -e

echo "After Install: Installing dependencies"

cd /home/ec2-user/app

# Yarn 설치 확인
if ! command -v yarn &> /dev/null; then
    echo "Installing Yarn..."
    npm install -g yarn
fi

# 의존성 설치
echo "Running yarn install..."
yarn install --production

echo "After Install completed"
