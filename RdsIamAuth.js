const mysql = require('mysql2/promise');
const { Signer } = require('@aws-sdk/rds-signer');
const dotenv = require('dotenv');

dotenv.config();

/**
 * RDS IAM 인증을 사용한 데이터베이스 커넥션 풀 관리자
 * - IAM 토큰 자동 갱신 (15분마다)
 * - 커넥션 풀 자동 관리
 * - 토큰 만료 전 사전 갱신
 */
class RdsIamAuthManager {
    constructor() {
        this.pool = null;
        this.tokenRefreshInterval = null;
        this.currentToken = null;
        this.tokenExpiryTime = null;

        // RDS 설정
        this.config = {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            database: process.env.DB_DATABASE,
            region: process.env.AWS_REGION || 'ap-northeast-2',
            // IAM 인증 사용 시
            ssl: process.env.USE_IAM_AUTH === 'true' ? {
                rejectUnauthorized: true
            } : undefined
        };

        // AWS RDS Signer 초기화 (AWS SDK v3)
        this.signer = new Signer({
            region: this.config.region,
            hostname: this.config.host,
            port: this.config.port,
            username: this.config.user
        });

        // 커넥션 풀 설정
        this.poolConfig = {
            connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10'),
            queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '0'),
            waitForConnections: true,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            // 연결 타임아웃 설정
            connectTimeout: 10000,
            // 유휴 연결 타임아웃 (8분 - 토큰 만료 15분보다 짧게)
            idleTimeout: 480000
        };
    }

    /**
     * IAM 인증 토큰 생성
     * @returns {Promise<string>} 인증 토큰
     */
    async generateAuthToken() {
        console.log('Generating new RDS IAM authentication token...');

        // AWS SDK v3에서는 getAuthToken이 Promise를 반환
        const token = await this.signer.getAuthToken();

        this.currentToken = token;
        // 토큰 만료 시간 설정 (15분 - 1분 여유)
        this.tokenExpiryTime = Date.now() + (14 * 60 * 1000);

        console.log('New token generated, expires at:', new Date(this.tokenExpiryTime).toISOString());

        return token;
    }

    /**
     * 토큰이 만료되었는지 확인
     * @returns {boolean}
     */
    isTokenExpired() {
        if (!this.tokenExpiryTime) return true;
        // 만료 1분 전부터 만료된 것으로 간주
        return Date.now() >= (this.tokenExpiryTime - 60000);
    }

    /**
     * 커넥션 풀 생성
     * @param {string} token - IAM 인증 토큰 (선택사항)
     * @returns {Promise<Pool>}
     */
    async createPool(token = null) {
        let poolOptions = {
            ...this.config,
            ...this.poolConfig
        };

        // IAM 인증 사용 시
        if (process.env.USE_IAM_AUTH === 'true') {
            if (!token) {
                token = await this.generateAuthToken();
            }
            poolOptions.password = token;
            poolOptions.authPlugins = {
                mysql_clear_password: () => () => token
            };
        } else {
            // 일반 비밀번호 인증
            poolOptions.password = process.env.DB_PWD;
        }

        console.log('Creating new connection pool...');
        const pool = mysql.createPool(poolOptions);

        // 커넥션 풀 이벤트 리스너
        pool.on('acquire', (connection) => {
            console.log('Connection %d acquired', connection.threadId);
        });

        pool.on('release', (connection) => {
            console.log('Connection %d released', connection.threadId);
        });

        pool.on('enqueue', () => {
            console.log('Waiting for available connection slot');
        });

        return pool;
    }

    /**
     * 커넥션 풀 갱신
     */
    async refreshPool() {
        console.log('Refreshing connection pool...');

        try {
            // 새 토큰 생성
            const newToken = await this.generateAuthToken();

            // 기존 풀 종료
            if (this.pool) {
                console.log('Closing old connection pool...');
                await this.pool.end();
            }

            // 새 풀 생성
            this.pool = await this.createPool(newToken);
            console.log('Connection pool refreshed successfully');

        } catch (error) {
            console.error('Error refreshing connection pool:', error);
            throw error;
        }
    }

    /**
     * 초기화 및 자동 갱신 시작
     */
    async initialize() {
        console.log('Initializing RDS IAM Auth Manager...');
        console.log('USE_IAM_AUTH:', process.env.USE_IAM_AUTH);

        try {
            // 초기 풀 생성
            this.pool = await this.createPool();

            // 연결 테스트
            const connection = await this.pool.getConnection();
            console.log('Database connection test successful');
            connection.release();

            // IAM 인증 사용 시에만 자동 갱신 설정
            if (process.env.USE_IAM_AUTH === 'true') {
                // 13분마다 토큰 갱신 (15분 만료 전에 갱신)
                const refreshInterval = 13 * 60 * 1000;
                this.tokenRefreshInterval = setInterval(async () => {
                    try {
                        await this.refreshPool();
                    } catch (error) {
                        console.error('Failed to refresh pool:', error);
                    }
                }, refreshInterval);

                console.log(`Token refresh scheduled every ${refreshInterval / 1000} seconds`);
            }

            console.log('RDS IAM Auth Manager initialized successfully');

        } catch (error) {
            console.error('Failed to initialize RDS IAM Auth Manager:', error);
            throw error;
        }
    }

    /**
     * 커넥션 가져오기
     * @returns {Promise<PoolConnection>}
     */
    async getConnection() {
        if (!this.pool) {
            throw new Error('Connection pool not initialized. Call initialize() first.');
        }

        // IAM 인증 사용 시 토큰 만료 체크
        if (process.env.USE_IAM_AUTH === 'true' && this.isTokenExpired()) {
            console.log('Token expired, refreshing pool...');
            await this.refreshPool();
        }

        return await this.pool.getConnection();
    }

    /**
     * 쿼리 실행
     * @param {string} sql - SQL 쿼리
     * @param {Array} params - 쿼리 파라미터
     * @returns {Promise<any>}
     */
    async query(sql, params = []) {
        if (!this.pool) {
            throw new Error('Connection pool not initialized. Call initialize() first.');
        }

        // IAM 인증 사용 시 토큰 만료 체크
        if (process.env.USE_IAM_AUTH === 'true' && this.isTokenExpired()) {
            console.log('Token expired, refreshing pool...');
            await this.refreshPool();
        }

        return await this.pool.query(sql, params);
    }

    /**
     * 정리 및 종료
     */
    async shutdown() {
        console.log('Shutting down RDS IAM Auth Manager...');

        // 자동 갱신 중지
        if (this.tokenRefreshInterval) {
            clearInterval(this.tokenRefreshInterval);
            this.tokenRefreshInterval = null;
        }

        // 커넥션 풀 종료
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }

        console.log('RDS IAM Auth Manager shut down successfully');
    }
}

// 싱글톤 인스턴스
let instance = null;

/**
 * 싱글톤 인스턴스 가져오기
 * @returns {RdsIamAuthManager}
 */
function getInstance() {
    if (!instance) {
        instance = new RdsIamAuthManager();
    }
    return instance;
}

module.exports = {
    RdsIamAuthManager,
    getInstance
};
