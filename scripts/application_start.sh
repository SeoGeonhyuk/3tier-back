#!/bin/bash
set -e

echo "Application Start: Starting PM2 application"

cd /home/ec2-user/app

# PM2 설치 확인
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# PM2로 애플리케이션 시작
echo "Starting 3tier-backend with PM2..."
pm2 start ecosystem.config.js --env production

# PM2 프로세스 목록 확인
pm2 list

# PM2 startup 설정 (재부팅 시 자동 시작)
pm2 startup systemd -u ec2-user --hp /home/ec2-user || true
pm2 save

echo "Application Start completed"
