const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'postgre_container',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'mydatabase',
  user: process.env.DB_USER || 'tidiane',
  password: process.env.DB_PASSWORD || 'tidkon',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    console.log('[DB] Connected to PostgreSQL successfully.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        surname VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('[DB] Tables initialized successfully.');
  } catch (err) {
    console.error('[DB] Error initializing tables:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
