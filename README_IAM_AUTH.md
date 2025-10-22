# AWS RDS IAM 인증 구현 가이드

이 프로젝트는 AWS RDS IAM 인증을 사용하여 데이터베이스에 연결하며, 토큰 자동 갱신과 커넥션 풀 관리를 지원합니다.

## 주요 기능

### 1. IAM 인증 토큰 자동 갱신
- IAM 인증 토큰은 15분마다 만료됩니다
- 자동으로 **13분마다** 토큰을 갱신하여 만료 전에 새 토큰 생성
- 쿼리 실행 전 토큰 만료 체크 및 자동 갱신

### 2. 커넥션 풀 관리
- MySQL2 Promise 기반 커넥션 풀 사용
- 토큰 갱신 시 커넥션 풀 자동 재생성
- 설정 가능한 풀 크기 및 큐 제한

### 3. Graceful Shutdown
- SIGTERM/SIGINT 시그널 처리
- 커넥션 풀 안전하게 종료
- 진행 중인 작업 완료 후 종료

### 4. 보안 개선
- SQL Injection 방지를 위한 파라미터화된 쿼리 사용
- 비밀번호 대신 임시 IAM 토큰 사용
- SSL/TLS 암호화 연결

## 파일 구조

```
3tier-back/
├── RdsIamAuth.js          # IAM 인증 및 커넥션 풀 관리자
├── TransactionService.js   # 비즈니스 로직 (async/await 방식)
├── index.js                # Express 서버 (async/await 방식)
├── DbConfig.js             # 데이터베이스 설정
├── .env                    # 환경 변수 (git에서 제외)
└── .env.example            # 환경 변수 예시
```

## 설정 방법

### 1. 환경 변수 설정

`.env.example`을 복사하여 `.env` 파일을 생성하고 값을 설정합니다:

```bash
cp .env.example .env
```

**IAM 인증 사용 시:**
```env
# Database Configuration
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_PORT=3306
DB_USER=iam_user
DB_DATABASE=your-database-name

# IAM Authentication
USE_IAM_AUTH=true

# AWS Region
AWS_REGION=ap-northeast-2

# Connection Pool Configuration (optional)
DB_POOL_SIZE=10
DB_QUEUE_LIMIT=0
```

**일반 비밀번호 인증 사용 시:**
```env
USE_IAM_AUTH=false
DB_PWD=your-password
```

### 2. AWS IAM 설정

#### RDS에서 IAM 인증 활성화
1. RDS 인스턴스에서 IAM 데이터베이스 인증을 활성화합니다
2. MySQL에서 IAM 인증 사용자를 생성합니다:

```sql
CREATE USER 'iam_user' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';
GRANT ALL PRIVILEGES ON your_database.* TO 'iam_user'@'%';
FLUSH PRIVILEGES;
```

#### IAM 정책 설정
EC2 인스턴스 또는 ECS 태스크에 연결된 IAM 역할에 다음 정책을 추가합니다:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "rds-db:connect"
            ],
            "Resource": [
                "arn:aws:rds-db:ap-northeast-2:ACCOUNT_ID:dbuser:RESOURCE_ID/iam_user"
            ]
        }
    ]
}
```

**Resource ARN 형식:**
```
arn:aws:rds-db:REGION:ACCOUNT_ID:dbuser:DB_RESOURCE_ID/DB_USERNAME
```

- `REGION`: AWS 리전 (예: ap-northeast-2)
- `ACCOUNT_ID`: AWS 계정 ID
- `DB_RESOURCE_ID`: RDS 인스턴스의 리소스 ID (DBI-로 시작)
- `DB_USERNAME`: IAM 인증 사용자 이름

### 3. 의존성 설치

```bash
npm install
```

필요한 패키지:
- `@aws-sdk/rds-signer`: AWS RDS IAM 인증 토큰 생성
- `mysql2`: MySQL 클라이언트 (Promise 지원)
- `dotenv`: 환경 변수 관리
- `express`: 웹 서버
- `cors`: CORS 지원
- `body-parser`: 요청 본문 파싱

### 4. 서버 실행

```bash
# 개발 환경
node index.js

# 프로덕션 환경 (PM2 사용)
pm2 start index.js --name 3tier-backend
```

## 동작 원리

### RdsIamAuthManager 클래스

```javascript
const { getInstance } = require('./RdsIamAuth');

// 싱글톤 인스턴스 가져오기
const dbManager = getInstance();

// 초기화
await dbManager.initialize();

// 쿼리 실행
const [results] = await dbManager.query('SELECT * FROM transactions');

// 커넥션 가져오기
const connection = await dbManager.getConnection();
try {
    await connection.query('INSERT INTO ...');
} finally {
    connection.release();
}

// 종료
await dbManager.shutdown();
```

### 토큰 갱신 플로우

```
시작
  ↓
초기 토큰 생성 (T0)
  ↓
커넥션 풀 생성
  ↓
13분 후 (T0 + 13m)
  ↓
새 토큰 생성 (T1)
  ↓
기존 풀 종료
  ↓
새 풀 생성
  ↓
13분 후 (T1 + 13m)
  ↓
... 반복 ...
```

### 쿼리 실행 시 토큰 체크

```javascript
async query(sql, params) {
    // IAM 인증 사용 시 토큰 만료 체크
    if (USE_IAM_AUTH && isTokenExpired()) {
        await refreshPool(); // 만료되었으면 갱신
    }

    return await pool.query(sql, params);
}
```

## API 엔드포인트

모든 엔드포인트는 async/await 방식으로 변경되었습니다.

### Health Check
```bash
GET /health
```

### Transaction 관리
```bash
# 모든 트랜잭션 조회
GET /transaction

# 트랜잭션 추가
POST /transaction
Content-Type: application/json
{
    "amount": 100.50,
    "desc": "Transaction description"
}

# 특정 트랜잭션 조회
GET /transaction/id
Content-Type: application/json
{
    "id": 1
}

# 특정 트랜잭션 삭제
DELETE /transaction/id
Content-Type: application/json
{
    "id": 1
}

# 모든 트랜잭션 삭제
DELETE /transaction
```

## Docker 배포

### Dockerfile 빌드
```bash
docker build -t 3tier-backend .
```

### 환경 변수와 함께 실행
```bash
docker run -d \
  -p 4000:4000 \
  -e DB_HOST=your-rds-endpoint.rds.amazonaws.com \
  -e DB_USER=iam_user \
  -e DB_DATABASE=your_db \
  -e USE_IAM_AUTH=true \
  -e AWS_REGION=ap-northeast-2 \
  --name backend \
  3tier-backend
```

### AWS ECS에서 IAM 역할 사용
ECS 태스크 정의에서 `taskRoleArn`을 설정하면 별도의 AWS 자격 증명 없이 IAM 인증을 사용할 수 있습니다.

```json
{
  "family": "3tier-backend",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ECSTaskRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "your-ecr-repo/3tier-backend:latest",
      "environment": [
        { "name": "USE_IAM_AUTH", "value": "true" },
        { "name": "DB_HOST", "value": "your-rds-endpoint.rds.amazonaws.com" },
        { "name": "DB_USER", "value": "iam_user" },
        { "name": "DB_DATABASE", "value": "your_db" },
        { "name": "AWS_REGION", "value": "ap-northeast-2" }
      ]
    }
  ]
}
```

## 모니터링 및 로깅

애플리케이션은 다음 이벤트를 로깅합니다:

- 데이터베이스 초기화
- 토큰 생성 및 만료 시간
- 커넥션 풀 이벤트 (acquire, release, enqueue)
- 토큰 갱신 작업
- 에러 및 경고

**로그 예시:**
```
Initializing database...
Initializing RDS IAM Auth Manager...
USE_IAM_AUTH: true
Generating new RDS IAM authentication token...
New token generated, expires at: 2024-10-16T12:45:00.000Z
Creating new connection pool...
Database connection test successful
Token refresh scheduled every 780 seconds
Transactions table checked/created successfully
Database initialization complete
AB3 backend app listening at http://localhost:4000
IAM Authentication: ENABLED
```

## 보안 고려사항

1. **IAM 역할 사용 권장**: AWS 환경에서는 액세스 키 대신 IAM 역할 사용
2. **최소 권한 원칙**: IAM 정책은 필요한 최소한의 권한만 부여
3. **SSL/TLS 사용**: RDS 연결 시 SSL 암호화 필수
4. **환경 변수 보호**: `.env` 파일은 절대 git에 커밋하지 않음
5. **SQL Injection 방지**: 모든 쿼리에 파라미터화된 쿼리 사용

## 트러블슈팅

### 토큰 생성 실패
```
Error: Could not generate token
```
**해결 방법:**
- IAM 역할에 `rds-db:connect` 권한이 있는지 확인
- AWS 자격 증명이 올바른지 확인
- RDS 엔드포인트와 리전이 올바른지 확인

### 연결 실패
```
Error: Access denied for user 'iam_user'
```
**해결 방법:**
- RDS에서 IAM 인증이 활성화되어 있는지 확인
- MySQL에서 IAM 사용자가 생성되었는지 확인
- 보안 그룹에서 포트 3306이 열려있는지 확인

### 토큰 만료
```
Error: Authentication token expired
```
**해결 방법:**
- 자동 갱신이 제대로 작동하는지 로그 확인
- 서버 시간이 정확한지 확인 (NTP 동기화)

## 성능 최적화

1. **커넥션 풀 크기 조정**: `DB_POOL_SIZE` 환경 변수로 조정
2. **유휴 타임아웃 설정**: 기본값 8분 (토큰 만료 15분보다 짧게)
3. **쿼리 인덱싱**: 자주 사용되는 쿼리에 대한 인덱스 생성
4. **캐싱 전략**: Redis 등을 사용한 쿼리 결과 캐싱

## 마이그레이션 가이드

### 기존 비밀번호 인증에서 IAM 인증으로 전환

1. RDS에서 IAM 인증 활성화
2. MySQL에서 IAM 사용자 생성
3. IAM 정책 설정
4. `.env` 파일 업데이트:
   ```env
   USE_IAM_AUTH=true
   DB_USER=iam_user  # IAM 사용자명으로 변경
   # DB_PWD는 제거 또는 주석 처리
   ```
5. 애플리케이션 재시작

### 롤백 (IAM 인증 → 비밀번호 인증)

`.env` 파일 업데이트:
```env
USE_IAM_AUTH=false
DB_USER=your_regular_user
DB_PWD=your_password
```

## 참고 자료

- [AWS RDS IAM Database Authentication](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html)
- [AWS SDK for JavaScript v3 - RDS Signer](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-rds-signer/)
- [MySQL2 Documentation](https://github.com/sidorares/node-mysql2)
