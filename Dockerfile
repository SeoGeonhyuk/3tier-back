# syntax=docker/dockerfile:1.4
# Node.js 백엔드 애플리케이션을 위한 Dockerfile (Yarn Berry Zero-Install with BuildKit)

# Stage 1: Dependencies - 의존성 설치 레이어
FROM node:20-alpine3.21 AS dependencies

# 보안 업데이트 적용
RUN apk upgrade --no-cache

# Non-root 사용자 생성
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# 디렉토리 소유권 변경
RUN chown -R nodejs:nodejs /app

# Non-root 사용자로 전환
USER nodejs

# Corepack 활성화 (Yarn Berry 사용을 위해)
RUN corepack enable

# Yarn 설정 파일 및 Zero-Install 캐시 복사
COPY --chown=nodejs:nodejs .yarnrc.yml ./
COPY --chown=nodejs:nodejs .yarn/ ./.yarn/

# package.json과 yarn.lock 복사
COPY --chown=nodejs:nodejs package.json yarn.lock ./

# BuildKit 캐시 마운트를 사용한 의존성 설치
RUN --mount=type=cache,target=/home/nodejs/.yarn,sharing=locked,uid=1001,gid=1001 \
    --mount=type=cache,target=/app/.yarn/cache,sharing=locked,uid=1001,gid=1001 \
    yarn install --immutable

# Stage 2: Test - devDependencies 포함하여 테스트 실행
FROM dependencies AS tester

# 애플리케이션 소스 복사
COPY --chown=nodejs:nodejs . .

# 테스트 실행 (테스트가 실패하면 빌드 중단)
RUN --mount=type=cache,target=/home/nodejs/.yarn,sharing=locked,uid=1001,gid=1001 \
    yarn test

# Stage 3: Production - 프로덕션 의존성만 포함
FROM node:20-alpine3.21 AS production

# 보안 업데이트 적용
RUN apk upgrade --no-cache

# Non-root 사용자 생성
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# 디렉토리 소유권 변경
RUN chown -R nodejs:nodejs /app

# Corepack 활성화
USER root
RUN corepack enable
USER nodejs

# Yarn 설정 파일 및 Zero-Install 캐시 복사
COPY --chown=nodejs:nodejs .yarnrc.yml ./
COPY --chown=nodejs:nodejs .yarn/ ./.yarn/

# package.json과 yarn.lock 복사
COPY --chown=nodejs:nodejs package.json yarn.lock ./

# 프로덕션 의존성만 설치
RUN --mount=type=cache,target=/home/nodejs/.yarn,sharing=locked,uid=1001,gid=1001 \
    --mount=type=cache,target=/app/.yarn/cache,sharing=locked,uid=1001,gid=1001 \
    yarn workspaces focus --production

RUN curl -o global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# 애플리케이션 소스 복사 (테스트 파일 제외)
COPY --chown=nodejs:nodejs index.js ./
COPY --chown=nodejs:nodejs DbConfig.js ./
COPY --chown=nodejs:nodejs RdsIamAuth.js ./
COPY --chown=nodejs:nodejs TransactionService.js ./
COPY --chown=nodejs:nodejs ecosystem.config.js ./

# PM2 전역 설치
USER root
RUN npm install -g pm2
USER nodejs

# 로그 디렉토리 생성
USER root
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs
USER nodejs

# 환경 변수 선언 (컨테이너 실행 시 주입될 예정)
# 아래 환경변수들은 ECS Task Definition, docker run -e, 또는 docker-compose에서 설정
ENV NODE_ENV=production

# 포트 노출
EXPOSE 4000

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# PM2로 애플리케이션 실행
CMD ["pm2-runtime", "start", "ecosystem.config.js", "--env", "production"]
