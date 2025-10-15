# Node.js 백엔드 애플리케이션을 위한 Dockerfile
FROM node:16-alpine

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 애플리케이션 소스 복사
COPY . .

# 포트 노출
EXPOSE 4000

# 환경 변수 설정 (기본값, .env 파일 또는 런타임에서 재정의 가능)
ENV NODE_ENV=production

# 애플리케이션 실행
CMD ["node", "index.js"]
