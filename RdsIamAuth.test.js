// Mock dependencies
jest.mock('mysql2/promise');
jest.mock('@aws-sdk/rds-signer', () => ({
    Signer: jest.fn()
}));
jest.mock('fs', () => ({
    readFileSync: jest.fn()
}));

const mysql = require('mysql2/promise');
const { Signer } = require('@aws-sdk/rds-signer');
const fs = require('fs');
const { RdsIamAuthManager, getInstance } = require('./RdsIamAuth');

describe('RdsIamAuthManager', () => {
    let mockPool;
    let mockConnection;
    let mockSigner;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup environment variables
        process.env.DB_HOST = 'test-db.amazonaws.com';
        process.env.DB_PORT = '3306';
        process.env.DB_USER = 'testuser';
        process.env.DB_DATABASE = 'testdb';
        process.env.AWS_REGION = 'ap-northeast-2';
        process.env.USE_IAM_AUTH = 'false';
        process.env.DB_POOL_SIZE = '10';
        process.env.DB_QUEUE_LIMIT = '0';
        process.env.DB_PWD = 'testpassword';

        // Mock connection
        mockConnection = {
            threadId: 1,
            release: jest.fn()
        };

        // Mock pool
        mockPool = {
            getConnection: jest.fn().mockResolvedValue(mockConnection),
            query: jest.fn().mockResolvedValue([[], []]),
            end: jest.fn().mockResolvedValue(undefined),
            on: jest.fn()
        };

        mysql.createPool = jest.fn().mockReturnValue(mockPool);

        // Mock Signer
        mockSigner = {
            getAuthToken: jest.fn().mockResolvedValue('mock-iam-token-12345')
        };
        Signer.mockImplementation(() => mockSigner);

        // Mock fs
        fs.readFileSync.mockReturnValue('mock-ca-certificate');
    });

    describe('Singleton Pattern', () => {
        test('getInstance should return the same instance', () => {
            const instance1 = getInstance();
            const instance2 = getInstance();

            expect(instance1).toBe(instance2);
        });

        test('should create new instance on first call', () => {
            const instance = getInstance();

            expect(instance).toBeInstanceOf(RdsIamAuthManager);
        });
    });

    describe('Constructor', () => {
        test('should initialize with correct configuration', () => {
            const manager = new RdsIamAuthManager();

            expect(manager.config.host).toBe('test-db.amazonaws.com');
            expect(manager.config.port).toBe('3306');
            expect(manager.config.user).toBe('testuser');
            expect(manager.config.database).toBe('testdb');
            expect(manager.config.region).toBe('ap-northeast-2');
        });

        test('should set SSL config when USE_IAM_AUTH is true', () => {
            process.env.USE_IAM_AUTH = 'true';
            process.env.CA_PATH = '/path/to/ca.pem';

            const manager = new RdsIamAuthManager();

            expect(manager.config.ssl).toBeDefined();
            expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/ca.pem');
        });

        test('should not set SSL config when USE_IAM_AUTH is false', () => {
            process.env.USE_IAM_AUTH = 'false';

            const manager = new RdsIamAuthManager();

            expect(manager.config.ssl).toBeUndefined();
        });
    });

    describe('Token Management (IAM Auth)', () => {
        test('generateAuthToken should create new token', async () => {
            const manager = new RdsIamAuthManager();

            const token = await manager.generateAuthToken();

            expect(token).toBe('mock-iam-token-12345');
            expect(manager.currentToken).toBe('mock-iam-token-12345');
            expect(manager.tokenExpiryTime).toBeGreaterThan(Date.now());
        });

        test('isTokenExpired should return true when no token exists', () => {
            const manager = new RdsIamAuthManager();

            expect(manager.isTokenExpired()).toBe(true);
        });

        test('isTokenExpired should return false for valid token', async () => {
            const manager = new RdsIamAuthManager();
            await manager.generateAuthToken();

            expect(manager.isTokenExpired()).toBe(false);
        });

        test('isTokenExpired should return true for expired token', async () => {
            const manager = new RdsIamAuthManager();
            await manager.generateAuthToken();

            // Manually set expiry time to past
            manager.tokenExpiryTime = Date.now() - 1000;

            expect(manager.isTokenExpired()).toBe(true);
        });
    });

    describe('Connection Pool Management', () => {
        test('createPool should create pool with IAM auth when enabled', async () => {
            process.env.USE_IAM_AUTH = 'true';
            const manager = new RdsIamAuthManager();

            await manager.createPool();

            expect(mysql.createPool).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'test-db.amazonaws.com',
                    password: 'mock-iam-token-12345',
                    authPlugins: expect.any(Object)
                })
            );
        });

        test('createPool should create pool with password auth when IAM disabled', async () => {
            process.env.USE_IAM_AUTH = 'false';
            const manager = new RdsIamAuthManager();

            await manager.createPool();

            expect(mysql.createPool).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'test-db.amazonaws.com',
                    password: 'testpassword'
                })
            );
        });

        test('createPool should setup event listeners', async () => {
            const manager = new RdsIamAuthManager();

            await manager.createPool();

            expect(mockPool.on).toHaveBeenCalledWith('acquire', expect.any(Function));
            expect(mockPool.on).toHaveBeenCalledWith('release', expect.any(Function));
            expect(mockPool.on).toHaveBeenCalledWith('enqueue', expect.any(Function));
        });
    });

    describe('initialize', () => {
        test('should initialize successfully with password auth', async () => {
            process.env.USE_IAM_AUTH = 'false';
            const manager = new RdsIamAuthManager();

            await manager.initialize();

            expect(mysql.createPool).toHaveBeenCalled();
            expect(mockPool.getConnection).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();

            // Cleanup
            await manager.shutdown();
        });

        test('should throw error when connection test fails', async () => {
            mockPool.getConnection.mockRejectedValue(new Error('Connection failed'));
            const manager = new RdsIamAuthManager();

            await expect(manager.initialize()).rejects.toThrow('Connection failed');
        });
    });

    describe('query', () => {
        test('should execute query successfully', async () => {
            const manager = new RdsIamAuthManager();
            await manager.initialize();

            const mockResults = [{ id: 1, name: 'test' }];
            mockPool.query.mockResolvedValue([mockResults, []]);

            const result = await manager.query('SELECT * FROM test', []);

            expect(result).toEqual([mockResults, []]);
            expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test', []);

            // Cleanup
            await manager.shutdown();
        });

        test('should throw error when pool not initialized', async () => {
            const manager = new RdsIamAuthManager();

            await expect(
                manager.query('SELECT * FROM test', [])
            ).rejects.toThrow('Connection pool not initialized');
        });
    });

    describe('getConnection', () => {
        test('should return connection from pool', async () => {
            const manager = new RdsIamAuthManager();
            await manager.initialize();

            const connection = await manager.getConnection();

            expect(connection).toBe(mockConnection);
            expect(mockPool.getConnection).toHaveBeenCalled();

            // Cleanup
            await manager.shutdown();
        });

        test('should throw error when pool not initialized', async () => {
            const manager = new RdsIamAuthManager();

            await expect(manager.getConnection()).rejects.toThrow(
                'Connection pool not initialized'
            );
        });
    });

    describe('shutdown', () => {
        test('should cleanup resources successfully', async () => {
            const manager = new RdsIamAuthManager();
            await manager.initialize();

            await manager.shutdown();

            expect(mockPool.end).toHaveBeenCalled();
            expect(manager.pool).toBeNull();
        });

        test('should handle shutdown when pool not initialized', async () => {
            const manager = new RdsIamAuthManager();

            await expect(manager.shutdown()).resolves.not.toThrow();
        });
    });

    describe('refreshPool', () => {
        test('should refresh pool with new token', async () => {
            process.env.USE_IAM_AUTH = 'true';
            const manager = new RdsIamAuthManager();
            await manager.initialize();

            const oldToken = manager.currentToken;

            // Mock new token
            mockSigner.getAuthToken.mockResolvedValue('new-mock-token-67890');

            await manager.refreshPool();

            expect(manager.currentToken).toBe('new-mock-token-67890');
            expect(manager.currentToken).not.toBe(oldToken);
            expect(mockPool.end).toHaveBeenCalled();

            // Cleanup - shutdown to clear the setInterval
            await manager.shutdown();
        });

        test('should handle error when refreshPool fails', async () => {
            const manager = new RdsIamAuthManager();
            await manager.initialize();

            // Mock token generation failure
            mockSigner.getAuthToken.mockRejectedValue(new Error('Token generation failed'));

            await expect(manager.refreshPool()).rejects.toThrow('Token generation failed');

            await manager.shutdown();
        });
    });

    describe('Token expiration and auto-refresh', () => {
        test('should refresh pool in getConnection when token expired', async () => {
            process.env.USE_IAM_AUTH = 'true';
            const manager = new RdsIamAuthManager();
            await manager.initialize();

            // Expire the token
            manager.tokenExpiryTime = Date.now() - 1000;

            // Mock new token for refresh
            mockSigner.getAuthToken.mockResolvedValue('refreshed-token');

            await manager.getConnection();

            // Should have called refresh
            expect(mockSigner.getAuthToken).toHaveBeenCalled();
            expect(manager.currentToken).toBe('refreshed-token');

            await manager.shutdown();
        });

        test('should refresh pool in query when token expired', async () => {
            process.env.USE_IAM_AUTH = 'true';
            const manager = new RdsIamAuthManager();
            await manager.initialize();

            // Expire the token
            manager.tokenExpiryTime = Date.now() - 1000;

            // Mock new token for refresh
            mockSigner.getAuthToken.mockResolvedValue('refreshed-token');
            mockPool.query.mockResolvedValue([[], []]);

            await manager.query('SELECT * FROM test');

            // Should have called refresh
            expect(mockSigner.getAuthToken).toHaveBeenCalled();
            expect(manager.currentToken).toBe('refreshed-token');

            await manager.shutdown();
        });
    });

    describe('Connection pool event listeners', () => {
        test('should trigger acquire event listener', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const manager = new RdsIamAuthManager();
            const pool = await manager.createPool();

            // Simulate acquire event
            const acquireCallback = pool.on.mock.calls.find(call => call[0] === 'acquire')[1];
            acquireCallback({ threadId: 123 });

            expect(consoleSpy).toHaveBeenCalledWith('Connection %d acquired', 123);
            consoleSpy.mockRestore();
        });

        test('should trigger release event listener', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const manager = new RdsIamAuthManager();
            const pool = await manager.createPool();

            // Simulate release event
            const releaseCallback = pool.on.mock.calls.find(call => call[0] === 'release')[1];
            releaseCallback({ threadId: 456 });

            expect(consoleSpy).toHaveBeenCalledWith('Connection %d released', 456);
            consoleSpy.mockRestore();
        });

        test('should trigger enqueue event listener', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const manager = new RdsIamAuthManager();
            const pool = await manager.createPool();

            // Simulate enqueue event
            const enqueueCallback = pool.on.mock.calls.find(call => call[0] === 'enqueue')[1];
            enqueueCallback();

            expect(consoleSpy).toHaveBeenCalledWith('Waiting for available connection slot');
            consoleSpy.mockRestore();
        });
    });

    describe('IAM Auth Plugin', () => {
        test('should create authPlugin callback for IAM authentication', async () => {
            process.env.USE_IAM_AUTH = 'true';
            const manager = new RdsIamAuthManager();
            const pool = await manager.createPool();

            // Get the authPlugins from createPool call
            const createPoolCall = mysql.createPool.mock.calls[mysql.createPool.mock.calls.length - 1];
            const poolOptions = createPoolCall[0];

            expect(poolOptions.authPlugins).toBeDefined();
            expect(poolOptions.authPlugins.mysql_clear_password).toBeDefined();

            // Test the auth plugin callback
            // mysql_clear_password: () => () => token
            // First call returns a function
            const authPlugin = poolOptions.authPlugins.mysql_clear_password();
            expect(typeof authPlugin).toBe('function');

            // Second call returns the token
            const token = authPlugin();
            expect(typeof token).toBe('string');
            expect(token).toBe('mock-iam-token-12345');
        });
    });

    describe('Scheduled token refresh (setInterval)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('should schedule periodic token refresh when IAM auth enabled', async () => {
            process.env.USE_IAM_AUTH = 'true';
            const manager = new RdsIamAuthManager();

            const refreshSpy = jest.spyOn(manager, 'refreshPool').mockResolvedValue();

            await manager.initialize();

            expect(manager.tokenRefreshInterval).toBeDefined();

            // Fast-forward time by 13 minutes
            jest.advanceTimersByTime(13 * 60 * 1000);

            // Wait for async operations
            await Promise.resolve();

            expect(refreshSpy).toHaveBeenCalled();

            await manager.shutdown();
            refreshSpy.mockRestore();
        });

        test('should handle error in scheduled refresh', async () => {
            process.env.USE_IAM_AUTH = 'true';
            const manager = new RdsIamAuthManager();

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const refreshSpy = jest.spyOn(manager, 'refreshPool')
                .mockRejectedValue(new Error('Scheduled refresh failed'));

            await manager.initialize();

            // Fast-forward time by 13 minutes
            jest.advanceTimersByTime(13 * 60 * 1000);

            // Wait for async operations
            await Promise.resolve();
            await Promise.resolve();

            expect(consoleSpy).toHaveBeenCalledWith('Failed to refresh pool:', expect.any(Error));

            await manager.shutdown();
            refreshSpy.mockRestore();
            consoleSpy.mockRestore();
        });
    });
});
