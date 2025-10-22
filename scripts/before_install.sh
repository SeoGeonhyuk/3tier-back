#!/bin/bash
set -e

echo "Before Install: Cleaning up old deployment"

# 로그 디렉토리 생성
mkdir -p /home/ec2-user/app/logs

# 이전 배포 파일 정리 (node_modules는 유지)
cd /home/ec2-user/app
if [ -d "/home/ec2-user/app" ]; then
    echo "Cleaning up old files..."
    find . -maxdepth 1 -type f -name "*.js" -delete
    find . -maxdepth 1 -type f -name "*.json" -delete
    find . -maxdepth 1 -type f -name "*.yml" -delete
    find . -maxdepth 1 -type f -name "*.lock" -delete
    rm -rf coverage
fi

echo "Before Install completed"
