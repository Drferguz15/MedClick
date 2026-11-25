require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('./db');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));
(async () => {
  try {
    const nombre = await ask('Nombre del administrador: ');
    const correo = (await ask('Correo: ')).trim().toLowerCase();
    const password = await ask('Contraseña (mínimo 10 caracteres): ');
    if (!nombre.trim() || !correo.includes('@') || password.length < 10) throw new Error('Datos no válidos.');
    const pool = await getPool();
    const hash = await bcrypt.hash(password, 12);
    await pool.request().input('n', sql.NVarChar, nombre.trim()).input('e', sql.NVarChar, correo)
      .input('h', sql.NVarChar, hash)
      .query(`INSERT dbo.Usuarios(Rol,NombreCompleto,Correo,PasswordHash,EstadoCuenta)
              VALUES('ADMIN',@n,@e,@h,'ACTIVO')`);
    console.log('Administrador creado. Inicia sesión seleccionando Administrador.');
  } catch (e) { console.error('No se pudo crear el administrador:', e.message); }
  finally { rl.close(); process.exit(); }
})();
