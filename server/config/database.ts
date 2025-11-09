/*
 * MySQL Database Connection Configuration
 */

import { createConnection, Connection } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let connection: Connection | null = null;

// Get MySQL connection string from environment
const getConnectionConfig = () => {
    // Support both connection string and individual parameters
    const connectionString = process.env.MYSQL_CONNECTION_STRING;
    
    if (connectionString) {
        // Parse connection string: mysql://user:password@host:port/database
        const match = connectionString.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
        if (match) {
            const [, user, password, host, port, database] = match;
            return {
                host,
                port: parseInt(port, 10),
                user,
                password,
                database,
                charset: 'utf8mb4',
                timezone: '+00:00',
                connectionLimit: 10,
                waitForConnections: true,
                queueLimit: 0,
            };
        }
    }
    
    // Fall back to individual environment variables
    return {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'tag_database',
        charset: 'utf8mb4',
        timezone: '+00:00',
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0,
    };
};

// Initialize database connection
export const getDatabaseConnection = async (): Promise<Connection> => {
    if (connection && connection.state !== 'disconnected') {
        return connection;
    }

    const config = getConnectionConfig();
    
    try {
        connection = await createConnection(config);
        console.log(`✅ Connected to MySQL database: ${config.database}@${config.host}:${config.port}`);
        return connection;
    } catch (error) {
        console.error('❌ Failed to connect to MySQL:', error);
        throw error;
    }
};

// Close database connection
export const closeDatabaseConnection = async (): Promise<void> => {
    if (connection) {
        await connection.end();
        connection = null;
        console.log('🔌 MySQL connection closed');
    }
};

// Get connection string for display
export const getConnectionString = (): string => {
    const config = getConnectionConfig();
    const password = config.password ? '***' : '';
    return `mysql://${config.user}:${password}@${config.host}:${config.port}/${config.database}`;
};

