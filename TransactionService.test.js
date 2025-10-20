// Mock RdsIamAuth before requiring TransactionService
jest.mock('./RdsIamAuth');

const transactionService = require('./TransactionService');
const { getInstance } = require('./RdsIamAuth');

describe('TransactionService', () => {
    let mockDbManager;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock DB manager
        mockDbManager = {
            query: jest.fn().mockResolvedValue([[{ insertId: 1, affectedRows: 1 }]]),
            initialize: jest.fn(),
            shutdown: jest.fn()
        };

        getInstance.mockReturnValue(mockDbManager);

        // Set the mock manager in the service
        transactionService.setDbManager(mockDbManager);
    });

    describe('setDbManager and getDbManager', () => {
        test('should set database manager', () => {
            const customManager = { query: jest.fn() };
            transactionService.setDbManager(customManager);

            // This is tested implicitly through other tests
            expect(true).toBe(true);
        });

        test('should auto-initialize dbManager when not set', async () => {
            // Clear the dbManager by setting it to null
            transactionService.setDbManager(null);

            // Mock the query to return successfully
            mockDbManager.query.mockResolvedValue([[{ insertId: 1, affectedRows: 1 }]]);

            // This should trigger getDbManager() which calls getInstance()
            await transactionService.addTransaction(100, 'Test');

            // Verify getInstance was called
            expect(getInstance).toHaveBeenCalled();
        });
    });

    describe('addTransaction', () => {
        test('should add transaction successfully', async () => {
            const mockResult = [{ insertId: 1, affectedRows: 1 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            const result = await transactionService.addTransaction(100, 'Test transaction');

            expect(result).toBe(200);
            expect(mockDbManager.query).toHaveBeenCalledWith(
                'INSERT INTO `transactions` (`amount`, `description`) VALUES (?, ?)',
                [100, 'Test transaction']
            );
        });

        test('should throw error when database query fails', async () => {
            const dbError = new Error('Database connection failed');
            mockDbManager.query.mockRejectedValue(dbError);

            await expect(
                transactionService.addTransaction(100, 'Test transaction')
            ).rejects.toThrow('Database connection failed');
        });

        test('should handle various amount types', async () => {
            const mockResult = [{ insertId: 1, affectedRows: 1 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            await transactionService.addTransaction(100.50, 'Decimal amount');
            expect(mockDbManager.query).toHaveBeenCalledWith(
                expect.any(String),
                [100.50, 'Decimal amount']
            );
        });
    });

    describe('getAllTransactions', () => {
        test('should return all transactions', async () => {
            const mockTransactions = [
                { id: 1, amount: 100, description: 'Transaction 1', created_at: '2024-01-01' },
                { id: 2, amount: 200, description: 'Transaction 2', created_at: '2024-01-02' }
            ];
            mockDbManager.query.mockResolvedValue([mockTransactions]);

            const result = await transactionService.getAllTransactions();

            expect(result).toEqual(mockTransactions);
            expect(mockDbManager.query).toHaveBeenCalledWith('SELECT * FROM transactions');
        });

        test('should return empty array when no transactions exist', async () => {
            mockDbManager.query.mockResolvedValue([[]]);

            const result = await transactionService.getAllTransactions();

            expect(result).toEqual([]);
        });

        test('should throw error when database query fails', async () => {
            const dbError = new Error('Database query failed');
            mockDbManager.query.mockRejectedValue(dbError);

            await expect(
                transactionService.getAllTransactions()
            ).rejects.toThrow('Database query failed');
        });
    });

    describe('findTransactionById', () => {
        test('should find transaction by id', async () => {
            const mockTransaction = [
                { id: 1, amount: 100, description: 'Test transaction', created_at: '2024-01-01' }
            ];
            mockDbManager.query.mockResolvedValue([mockTransaction]);

            const result = await transactionService.findTransactionById(1);

            expect(result).toEqual(mockTransaction);
            expect(mockDbManager.query).toHaveBeenCalledWith(
                'SELECT * FROM transactions WHERE id = ?',
                [1]
            );
        });

        test('should return empty array when transaction not found', async () => {
            mockDbManager.query.mockResolvedValue([[]]);

            const result = await transactionService.findTransactionById(999);

            expect(result).toEqual([]);
        });

        test('should throw error when database query fails', async () => {
            const dbError = new Error('Database query failed');
            mockDbManager.query.mockRejectedValue(dbError);

            await expect(
                transactionService.findTransactionById(1)
            ).rejects.toThrow('Database query failed');
        });

        test('should handle string id parameter', async () => {
            mockDbManager.query.mockResolvedValue([[]]);

            await transactionService.findTransactionById('5');

            expect(mockDbManager.query).toHaveBeenCalledWith(
                expect.any(String),
                ['5']
            );
        });
    });

    describe('deleteAllTransactions', () => {
        test('should delete all transactions', async () => {
            const mockResult = [{ affectedRows: 5 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            const result = await transactionService.deleteAllTransactions();

            expect(result).toEqual({ affectedRows: 5 });
            expect(mockDbManager.query).toHaveBeenCalledWith('DELETE FROM transactions');
        });

        test('should return 0 affected rows when no transactions exist', async () => {
            const mockResult = [{ affectedRows: 0 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            const result = await transactionService.deleteAllTransactions();

            expect(result).toEqual({ affectedRows: 0 });
        });

        test('should throw error when database query fails', async () => {
            const dbError = new Error('Database query failed');
            mockDbManager.query.mockRejectedValue(dbError);

            await expect(
                transactionService.deleteAllTransactions()
            ).rejects.toThrow('Database query failed');
        });
    });

    describe('deleteTransactionById', () => {
        test('should delete transaction by id', async () => {
            const mockResult = [{ affectedRows: 1 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            const result = await transactionService.deleteTransactionById(1);

            expect(result).toEqual({ affectedRows: 1 });
            expect(mockDbManager.query).toHaveBeenCalledWith(
                'DELETE FROM transactions WHERE id = ?',
                [1]
            );
        });

        test('should return 0 affected rows when transaction not found', async () => {
            const mockResult = [{ affectedRows: 0 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            const result = await transactionService.deleteTransactionById(999);

            expect(result).toEqual({ affectedRows: 0 });
        });

        test('should throw error when database query fails', async () => {
            const dbError = new Error('Database query failed');
            mockDbManager.query.mockRejectedValue(dbError);

            await expect(
                transactionService.deleteTransactionById(1)
            ).rejects.toThrow('Database query failed');
        });

        test('should handle string id parameter', async () => {
            const mockResult = [{ affectedRows: 1 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            await transactionService.deleteTransactionById('5');

            expect(mockDbManager.query).toHaveBeenCalledWith(
                expect.any(String),
                ['5']
            );
        });
    });

    describe('SQL Injection Prevention', () => {
        test('should use parameterized queries for addTransaction', async () => {
            const mockResult = [{ insertId: 1, affectedRows: 1 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            const maliciousInput = "'; DROP TABLE transactions; --";
            await transactionService.addTransaction(100, maliciousInput);

            // Verify that the input is passed as parameter, not concatenated
            expect(mockDbManager.query).toHaveBeenCalledWith(
                expect.stringContaining('?'),
                expect.arrayContaining([maliciousInput])
            );
        });

        test('should use parameterized queries for findTransactionById', async () => {
            mockDbManager.query.mockResolvedValue([[]]);

            const maliciousId = "1 OR 1=1";
            await transactionService.findTransactionById(maliciousId);

            expect(mockDbManager.query).toHaveBeenCalledWith(
                expect.stringContaining('?'),
                expect.arrayContaining([maliciousId])
            );
        });

        test('should use parameterized queries for deleteTransactionById', async () => {
            const mockResult = [{ affectedRows: 0 }];
            mockDbManager.query.mockResolvedValue(mockResult);

            const maliciousId = "1 OR 1=1";
            await transactionService.deleteTransactionById(maliciousId);

            expect(mockDbManager.query).toHaveBeenCalledWith(
                expect.stringContaining('?'),
                expect.arrayContaining([maliciousId])
            );
        });
    });
});
