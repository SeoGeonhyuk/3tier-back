const transactionService = require('./TransactionService');
const { getInstance } = require('./RdsIamAuth');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const os = require('os');
const fetch = require('node-fetch');

const app = express();
const port = 4000;
const corsOption = {
    origin: process.env.CORS_ORIGIN,
    credentials: true
}

// RDS IAM Auth Manager 인스턴스
let dbManager = null;
let server = null;

// Initialize database and create transactions table if not exists
async function initializeDatabase() {
    try {
        console.log('Initializing database...');

        // RDS IAM Auth Manager 초기화
        dbManager = getInstance();
        await dbManager.initialize();

        // TransactionService에 DB 매니저 설정
        transactionService.setDbManager(dbManager);

        // 테이블 생성
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                amount DECIMAL(10, 2) NOT NULL,
                description VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await dbManager.query(createTableQuery);
        console.log('Transactions table checked/created successfully');

    } catch (err) {
        console.error('Error initializing database:', err.message);
        throw err;
    }
}

// Graceful shutdown handler
function setupGracefulShutdown() {
    const shutdown = async (signal) => {
        console.log(`\n${signal} received, shutting down gracefully...`);

        // 서버 종료
        if (server) {
            server.close(() => {
                console.log('HTTP server closed');
            });
        }

        // DB 매니저 종료
        if (dbManager) {
            await dbManager.shutdown();
        }

        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors(corsOption));

// ROUTES FOR OUR API
// =======================================================

// Version Info
app.get('/', (req, res) => {
    const packageJson = require('./package.json');
    res.json({
        service: "3tier-backend",
        version: packageJson.version
    });
});

//Health Checking
app.get('/health', (req, res) => {
    res.json({ status: "healthy", message: "This is the health check" });
});

// ADD TRANSACTION
app.post('/transaction', async (req, res) => {
    try {
        console.log('POST /transaction - Body:', req.body);
        const { amount, desc } = req.body;

        if (!amount || !desc) {
            return res.status(400).json({
                message: 'Missing required fields: amount and desc'
            });
        }

        await transactionService.addTransaction(amount, desc);
        res.status(200).json({ message: 'added transaction successfully' });

    } catch (err) {
        console.error('Error in POST /transaction:', err);
        res.status(500).json({
            message: 'something went wrong',
            error: err.message
        });
    }
});

// GET ALL TRANSACTIONS
app.get('/transaction', async (req, res) => {
    try {
        const results = await transactionService.getAllTransactions();

        const transactionList = results.map(row => ({
            id: row.id,
            amount: row.amount,
            description: row.description,
            created_at: row.created_at
        }));

        console.log('Retrieved transactions:', transactionList.length);
        res.status(200).json({ result: transactionList });

    } catch (err) {
        console.error('Error in GET /transaction:', err);
        res.status(500).json({
            message: "could not get all transactions",
            error: err.message
        });
    }
});

//DELETE ALL TRANSACTIONS
app.delete('/transaction', async (req, res) => {
    try {
        const result = await transactionService.deleteAllTransactions();
        res.status(200).json({
            message: "delete function execution finished.",
            affectedRows: result.affectedRows
        });

    } catch (err) {
        console.error('Error in DELETE /transaction:', err);
        res.status(500).json({
            message: "Deleting all transactions may have failed.",
            error: err.message
        });
    }
});

//DELETE ONE TRANSACTION
app.delete('/transaction/id', async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                message: 'Missing required field: id'
            });
        }

        const result = await transactionService.deleteTransactionById(id);
        res.status(200).json({
            message: `transaction with id ${id} seemingly deleted`,
            affectedRows: result.affectedRows
        });

    } catch (err) {
        console.error('Error in DELETE /transaction/id:', err);
        res.status(500).json({
            message: "error deleting transaction",
            error: err.message
        });
    }
});

//GET SINGLE TRANSACTION
app.get('/transaction/id', async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({
                message: 'Missing required field: id'
            });
        }

        const result = await transactionService.findTransactionById(id);

        if (result.length === 0) {
            return res.status(404).json({
                message: `transaction with id ${id} not found`
            });
        }

        const transaction = result[0];
        res.status(200).json({
            id: transaction.id,
            amount: transaction.amount,
            description: transaction.description,
            created_at: transaction.created_at
        });

    } catch (err) {
        console.error('Error in GET /transaction/id:', err);
        res.status(500).json({
            message: "error retrieving transaction",
            error: err.message
        });
    }
});

// Initialize database and start server
async function startServer() {
    try {
        // 데이터베이스 초기화
        await initializeDatabase();
        console.log('Database initialization complete');

        // Graceful shutdown 설정
        setupGracefulShutdown();

        // 서버 시작
        server = app.listen(port, () => {
            console.log(`AB3 backend app listening at http://localhost:${port}`);
            console.log(`IAM Authentication: ${process.env.USE_IAM_AUTH === 'true' ? 'ENABLED' : 'DISABLED'}`);
        });

    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

// 서버 시작
startServer();
