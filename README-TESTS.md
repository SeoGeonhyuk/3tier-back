# 3tier-back Test Documentation

## Overview
This document provides information about the test suite for the 3tier-back application.

## Test Coverage

### API Endpoint Tests (`index.test.js`)
- **Version Endpoint**: `GET /` - Returns service name and version
- **Health Check**: `GET /health` - Returns health status
- **Create Transaction**: `POST /transaction` - Adds new transaction
- **Get All Transactions**: `GET /transaction` - Retrieves all transactions
- **Get Single Transaction**: `GET /transaction/id` - Retrieves specific transaction
- **Delete Transaction**: `DELETE /transaction/id` - Deletes specific transaction
- **Delete All Transactions**: `DELETE /transaction` - Deletes all transactions

### Business Logic Tests (`TransactionService.test.js`)
- Transaction CRUD operations
- Database manager initialization
- SQL injection prevention
- Error handling

### Database Connection Tests (`RdsIamAuth.test.js`)
- Singleton pattern implementation
- IAM authentication token management
- Connection pool management
- Token refresh mechanism
- Graceful shutdown

## Running Tests

### Install Dependencies
```bash
npm install
```

Note: If you encounter npm cache permission errors, the test dependencies are already configured in `package.json`. You can manually install them with:
```bash
npm install --save-dev jest supertest @jest/globals --force
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage Report
```bash
npm test -- --coverage
```

## Test Structure

```
3tier-back/
├── index.test.js              # API endpoint tests
├── TransactionService.test.js # Business logic tests
├── RdsIamAuth.test.js        # Database connection tests
├── index.js                   # Main application file
├── TransactionService.js      # Transaction service
├── RdsIamAuth.js             # RDS IAM authentication manager
└── package.json              # Test configuration
```

## Testing Framework
- **Jest**: JavaScript testing framework
- **Supertest**: HTTP assertion library for API testing
- **@jest/globals**: Jest global functions

## Mock Strategy
- Database connections are mocked to avoid requiring actual database
- RDS IAM authentication is mocked for unit testing
- API endpoints are tested with mocked service layer

## Test Environment Variables
The tests use the following environment variables:
- `DB_HOST`: Database host
- `DB_PORT`: Database port (default: 3306)
- `DB_USER`: Database user
- `DB_DATABASE`: Database name
- `USE_IAM_AUTH`: Enable IAM authentication (true/false)
- `DB_PWD`: Database password (when IAM auth disabled)
- `CORS_ORIGIN`: CORS allowed origin

## Version Endpoint
The application now includes a version endpoint at `GET /`:

**Request:**
```bash
curl http://localhost:4000/
```

**Response:**
```json
{
  "service": "3tier-backend",
  "version": "1.0.0"
}
```

## Notes
- Tests use mocked database connections, so no actual database is required
- IAM authentication tests verify token generation and refresh logic
- All parameterized queries are tested for SQL injection prevention
- Error handling is tested for all critical paths
