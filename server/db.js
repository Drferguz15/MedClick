const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  ...(process.env.DB_INSTANCE ? { options: { instanceName: process.env.DB_INSTANCE } } : {}),
  ...(process.env.DB_PORT ? { port: Number(process.env.DB_PORT) } : {}),
  database: process.env.DB_DATABASE || 'MedClickDB',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false'
  }
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(config);
  return pool;
}
module.exports = { sql, getPool };
