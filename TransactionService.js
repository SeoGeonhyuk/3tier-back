const { getInstance } = require('./RdsIamAuth');

// 데이터베이스 매니저 인스턴스 (초기화는 index.js에서 수행)
let dbManager = null;

/**
 * DB 매니저 설정 (index.js에서 초기화 후 호출)
 */
function setDbManager(manager) {
    dbManager = manager;
}

/**
 * DB 매니저 가져오기
 */
function getDbManager() {
    if (!dbManager) {
        dbManager = getInstance();
    }
    return dbManager;
}

/**
 * 트랜잭션 추가
 * @param {number} amount - 금액
 * @param {string} desc - 설명
 * @returns {Promise<number>}
 */
async function addTransaction(amount, desc) {
    const manager = getDbManager();

    // SQL Injection 방지를 위해 파라미터화된 쿼리 사용
    const sql = 'INSERT INTO `transactions` (`amount`, `description`) VALUES (?, ?)';

    try {
        const [result] = await manager.query(sql, [amount, desc]);
        console.log("Transaction added successfully, insertId:", result.insertId);
        return 200;
    } catch (err) {
        console.error("Error adding transaction:", err);
        throw err;
    }
}

/**
 * 모든 트랜잭션 조회
 * @returns {Promise<Array>}
 */
async function getAllTransactions() {
    const manager = getDbManager();

    const sql = "SELECT * FROM transactions";

    try {
        const [results] = await manager.query(sql);
        console.log("Retrieved all transactions, count:", results.length);
        return results;
    } catch (err) {
        console.error("Error getting all transactions:", err);
        throw err;
    }
}

/**
 * ID로 트랜잭션 조회
 * @param {number} id - 트랜잭션 ID
 * @returns {Promise<Array>}
 */
async function findTransactionById(id) {
    const manager = getDbManager();

    // SQL Injection 방지를 위해 파라미터화된 쿼리 사용
    const sql = 'SELECT * FROM transactions WHERE id = ?';

    try {
        const [results] = await manager.query(sql, [id]);
        console.log(`Retrieved transaction with id ${id}`);
        return results;
    } catch (err) {
        console.error(`Error retrieving transaction with id ${id}:`, err);
        throw err;
    }
}

/**
 * 모든 트랜잭션 삭제
 * @returns {Promise<Object>}
 */
async function deleteAllTransactions() {
    const manager = getDbManager();

    const sql = "DELETE FROM transactions";

    try {
        const [result] = await manager.query(sql);
        console.log("Deleted all transactions, affected rows:", result.affectedRows);
        return result;
    } catch (err) {
        console.error("Error deleting all transactions:", err);
        throw err;
    }
}

/**
 * ID로 트랜잭션 삭제
 * @param {number} id - 트랜잭션 ID
 * @returns {Promise<Object>}
 */
async function deleteTransactionById(id) {
    const manager = getDbManager();

    // SQL Injection 방지를 위해 파라미터화된 쿼리 사용
    const sql = 'DELETE FROM transactions WHERE id = ?';

    try {
        const [result] = await manager.query(sql, [id]);
        console.log(`Deleted transaction with id ${id}, affected rows:`, result.affectedRows);
        return result;
    } catch (err) {
        console.error(`Error deleting transaction with id ${id}:`, err);
        throw err;
    }
}

module.exports = {
    setDbManager,
    addTransaction,
    getAllTransactions,
    deleteAllTransactions,
    findTransactionById,
    deleteTransactionById
};







