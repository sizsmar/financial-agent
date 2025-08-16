const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DB_CONNECTION_STRING ||
    `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test de conexion
pool.on('connect', (client) => {
    console.log('Conectado a PostgreSQL');
});

pool.on('error', (err, client) => {
    console.error('Error en la conexion a PostgreSQL:', err);
    process.exit(-1);
});

// Funcion para probar la conexion
async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
        console.log('Test de conexion exitoso: ', {
            time: result.rows[0].current_time,
            version: result.rows[0].pg_version.split(' ')[0] + result.rows[0].pg_version.split(' ')[1]
        });
        client.release();
        return true;
    } catch (error) {
        console.error('Error en test de conexion:', error.message);
        return false;
    }
}

// Funcion para cerrar todas las conexiones
async function closePool() {
    try {
        await pool.end();
        console.log('Pool de conexiones cerrado');
    } catch (error) {
        console.error('Error cerrando pool:', error);
    }
}

module.exports = {
    pool,
    testConnection,
    closePool
};