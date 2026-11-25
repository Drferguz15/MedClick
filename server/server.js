require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { sql, getPool } = require('./db');
const { requireAuth, requireRole, requireActiveDoctor } = require('./middleware');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'medclick.sid',
  secret: process.env.SESSION_SECRET || 'CAMBIAR_SECRET',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 150 }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const clean = v => typeof v === 'string' ? v.trim() : v;
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const userSafe = u => ({
  id: u.UsuarioID, rol: u.Rol, nombre: u.NombreCompleto,
  correo: u.Correo, estadoCuenta: u.EstadoCuenta,
  suscripcionEstado: u.SuscripcionEstado || null,
  fechaVencimiento: u.FechaVencimiento || null
});

app.get('/api/salud', (req, res) => res.json({ ok: true, app: 'MedClick' }));

app.post('/api/registro/paciente', async (req, res) => {
  try {
    const { nombre, carnet, fechaNacimiento, sexo, correo, password } = req.body;
    if (!nombre || !carnet || !fechaNacimiento || !validEmail(correo) || !password || password.length < 8)
      return res.status(400).json({ error: 'Completa los datos. La contraseña debe tener al menos 8 caracteres.' });
    const pool = await getPool();
    const hash = await bcrypt.hash(password, 12);
    const tx = new sql.Transaction(pool); await tx.begin();
    try {
      const u = await new sql.Request(tx).input('rol', sql.VarChar, 'PACIENTE')
        .input('nombre', sql.NVarChar, clean(nombre)).input('correo', sql.NVarChar, clean(correo).toLowerCase())
        .input('carnet', sql.NVarChar, clean(carnet)).input('fecha', sql.Date, fechaNacimiento)
        .input('sexo', sql.NVarChar, sexo || null).input('hash', sql.NVarChar, hash)
        .query(`INSERT dbo.Usuarios(Rol,NombreCompleto,Correo,Carnet,FechaNacimiento,Sexo,PasswordHash)
                OUTPUT INSERTED.UsuarioID VALUES(@rol,@nombre,@correo,@carnet,@fecha,@sexo,@hash)`);
      const id = u.recordset[0].UsuarioID;
      const existingPatient = await new sql.Request(tx).input('carnet', sql.NVarChar, clean(carnet))
        .query('SELECT PacienteID,UsuarioID FROM dbo.Pacientes WHERE Carnet=@carnet');
      if (existingPatient.recordset.length) {
        if (existingPatient.recordset[0].UsuarioID) throw new Error('Este carnet ya tiene una cuenta vinculada.');
        await new sql.Request(tx).input('uid', sql.Int, id).input('pid', sql.Int, existingPatient.recordset[0].PacienteID)
          .input('correo', sql.NVarChar, clean(correo).toLowerCase())
          .query('UPDATE dbo.Pacientes SET UsuarioID=@uid,Correo=@correo WHERE PacienteID=@pid');
      } else {
        await new sql.Request(tx).input('uid', sql.Int, id).input('nombre', sql.NVarChar, clean(nombre))
          .input('carnet', sql.NVarChar, clean(carnet)).input('fecha', sql.Date, fechaNacimiento)
          .input('sexo', sql.NVarChar, sexo || null).input('correo', sql.NVarChar, clean(correo).toLowerCase())
          .query(`INSERT dbo.Pacientes(UsuarioID,NombreCompleto,Carnet,FechaNacimiento,Sexo,Correo)
                  VALUES(@uid,@nombre,@carnet,@fecha,@sexo,@correo)`);
      }
      await tx.commit();
      res.status(201).json({ message: 'Cuenta de paciente creada. Ya puedes iniciar sesión.' });
    } catch (e) { await tx.rollback(); throw e; }
  } catch (e) { console.error(e); res.status(400).json({ error: 'No se pudo registrar. Verifica que el carnet y correo no estén registrados.' }); }
});

app.post('/api/registro/medico', async (req, res) => {
  try {
    const { nombre, matricula, correo, password } = req.body;
    if (!nombre || !matricula || !validEmail(correo) || !password || password.length < 8)
      return res.status(400).json({ error: 'Completa todos los campos. La contraseña debe tener al menos 8 caracteres.' });
    const pool = await getPool(), hash = await bcrypt.hash(password, 12);
    const result = await pool.request().input('nombre', sql.NVarChar, clean(nombre))
      .input('mat', sql.NVarChar, clean(matricula)).input('correo', sql.NVarChar, clean(correo).toLowerCase())
      .input('hash', sql.NVarChar, hash)
      .query(`INSERT dbo.Usuarios(Rol,NombreCompleto,MatriculaProfesional,Correo,PasswordHash,EstadoCuenta)
              VALUES('MEDICO',@nombre,@mat,@correo,@hash,'PENDIENTE');
              SELECT SCOPE_IDENTITY() AS id;`);
    const id = result.recordset[0].id;
    await pool.request().input('id', sql.Int, id)
      .query(`INSERT dbo.Suscripciones(MedicoID,Estado) VALUES(@id,'PENDIENTE')`);
    res.status(201).json({ message: 'Solicitud registrada. El administrador debe verificar el pago y habilitar tu cuenta.' });
  } catch (e) { console.error(e); res.status(400).json({ error: 'No se pudo registrar. Verifica matrícula y correo.' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { identificador, password, rol } = req.body;
    const pool = await getPool();
    const r = await pool.request().input('identificador', sql.NVarChar, clean(identificador))
      .input('rol', sql.VarChar, rol)
      .query(`SELECT TOP 1 u.*, s.Estado AS SuscripcionEstado, s.FechaVencimiento
              FROM dbo.Usuarios u LEFT JOIN dbo.Suscripciones s ON s.MedicoID=u.UsuarioID
              WHERE (u.Correo=@identificador OR u.Carnet=@identificador OR u.MatriculaProfesional=@identificador)
              AND u.Rol=@rol`);
    const u = r.recordset[0];
    if (!u || !(await bcrypt.compare(password || '', u.PasswordHash)))
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    if (u.EstadoCuenta === 'SUSPENDIDO') return res.status(403).json({ error: 'Cuenta suspendida. Contacta al administrador.' });
    req.session.user = userSafe(u);
    res.json({ user: req.session.user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error al iniciar sesión.' }); }
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.session.user }));
app.post('/api/logout', requireAuth, (req, res) => req.session.destroy(() => res.json({ message: 'Sesión cerrada.' })));

app.get('/api/medicos', async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT UsuarioID,NombreCompleto,MatriculaProfesional
    FROM dbo.Usuarios WHERE Rol='MEDICO' AND EstadoCuenta='ACTIVO' ORDER BY NombreCompleto`);
  res.json(r.recordset);
});

/* Médico: ficha asistida del paciente. Si luego el paciente se registra con el mismo carnet,
   se vincula automáticamente desde este endpoint. */
app.post('/api/pacientes/asistido', requireAuth, requireRole('MEDICO','ADMIN'), async (req, res) => {
  try {
    const { nombre, carnet, fechaNacimiento, sexo, correo } = req.body;
    if (!nombre || !carnet || !fechaNacimiento) return res.status(400).json({ error: 'Nombre, carnet y fecha son obligatorios.' });
    const pool = await getPool();
    const existing = await pool.request().input('c', sql.NVarChar, clean(carnet))
      .query('SELECT PacienteID FROM dbo.Pacientes WHERE Carnet=@c');
    if (existing.recordset.length) return res.status(409).json({ error: 'Ya existe un paciente con ese carnet.' });
    const r = await pool.request().input('n', sql.NVarChar, clean(nombre)).input('c', sql.NVarChar, clean(carnet))
      .input('f', sql.Date, fechaNacimiento).input('s', sql.NVarChar, sexo || null)
      .input('e', sql.NVarChar, correo || null).input('creator', sql.Int, req.session.user.id)
      .query(`INSERT dbo.Pacientes(NombreCompleto,Carnet,FechaNacimiento,Sexo,Correo,CreadoPor)
        OUTPUT INSERTED.PacienteID VALUES(@n,@c,@f,@s,@e,@creator)`);
    res.status(201).json({ message: 'Ficha creada. Entrega al paciente su carnet para que cree su acceso.', pacienteId: r.recordset[0].PacienteID });
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudo crear la ficha.' }); }
});

app.get('/api/pacientes', requireAuth, requireRole('MEDICO','ADMIN'), async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT PacienteID,NombreCompleto,Carnet,FechaNacimiento,Correo
    FROM dbo.Pacientes ORDER BY NombreCompleto`);
  res.json(r.recordset);
});

app.get('/api/mis-consultas', requireAuth, async (req, res) => {
  const pool = await getPool(), u = req.session.user;
  let r;
  if (u.rol === 'PACIENTE') {
    r = await pool.request().input('uid', sql.Int, u.id).query(`
      SELECT c.ConsultaID,c.FechaConsulta,c.MotivoConsulta,c.Diagnostico,c.Tratamiento,
      c.Observaciones,c.EnfermedadActual,c.ExamenFisico,sv.PesoKg,sv.TallaCm,sv.PresionArterial,
      sv.FrecuenciaCardiaca,sv.FrecuenciaRespiratoria,sv.Temperatura,sv.SaturacionOxigeno,sv.Glicemia,sv.IMC,
      m.NombreCompleto AS Medico
      FROM dbo.Consultas c JOIN dbo.Pacientes p ON p.PacienteID=c.PacienteID
      JOIN dbo.Usuarios m ON m.UsuarioID=c.MedicoID LEFT JOIN dbo.SignosVitales sv ON sv.ConsultaID=c.ConsultaID
      WHERE p.UsuarioID=@uid ORDER BY c.FechaConsulta DESC`);
  } else if (u.rol === 'MEDICO') {
    r = await pool.request().input('mid', sql.Int, u.id).query(`
      SELECT c.ConsultaID,c.FechaConsulta,c.MotivoConsulta,c.Diagnostico,c.Tratamiento,
      p.NombreCompleto AS Paciente,p.Carnet
      FROM dbo.Consultas c JOIN dbo.Pacientes p ON p.PacienteID=c.PacienteID
      WHERE c.MedicoID=@mid ORDER BY c.FechaConsulta DESC`);
  } else {
    r = await pool.request().query(`SELECT c.ConsultaID,c.FechaConsulta,c.Diagnostico,p.NombreCompleto AS Paciente,m.NombreCompleto AS Medico
      FROM dbo.Consultas c JOIN dbo.Pacientes p ON p.PacienteID=c.PacienteID JOIN dbo.Usuarios m ON m.UsuarioID=c.MedicoID
      ORDER BY c.FechaConsulta DESC`);
  }
  res.json(r.recordset);
});

app.post('/api/consultas', requireAuth, requireActiveDoctor, async (req, res) => {
  const b = req.body;
  if (!b.pacienteId || !b.diagnostico) return res.status(400).json({ error: 'Selecciona paciente e ingresa diagnóstico.' });
  const pool = await getPool(), tx = new sql.Transaction(pool); await tx.begin();
  try {
    const p = await new sql.Request(tx).input('pid', sql.Int, Number(b.pacienteId))
      .query('SELECT PacienteID FROM dbo.Pacientes WHERE PacienteID=@pid');
    if (!p.recordset.length) throw new Error('Paciente no encontrado.');
    const c = await new sql.Request(tx)
      .input('pid', sql.Int, Number(b.pacienteId)).input('mid', sql.Int, req.session.user.id)
      .input('motivo', sql.NVarChar(sql.MAX), b.motivo || null)
      .input('enfermedad', sql.NVarChar(sql.MAX), b.enfermedad || null)
      .input('examen', sql.NVarChar(sql.MAX), b.examen || null)
      .input('diag', sql.NVarChar(sql.MAX), b.diagnostico)
      .input('trat', sql.NVarChar(sql.MAX), b.tratamiento || null)
      .input('obs', sql.NVarChar(sql.MAX), b.observaciones || null)
      .query(`INSERT dbo.Consultas(PacienteID,MedicoID,MotivoConsulta,EnfermedadActual,ExamenFisico,Diagnostico,Tratamiento,Observaciones)
       OUTPUT INSERTED.ConsultaID VALUES(@pid,@mid,@motivo,@enfermedad,@examen,@diag,@trat,@obs)`);
    const id = c.recordset[0].ConsultaID;
    const n = b.signos || {};
    const peso = n.peso ? Number(n.peso) : null, talla = n.talla ? Number(n.talla) : null;
    const imc = peso && talla ? Number((peso / ((talla/100) ** 2)).toFixed(2)) : null;
    await new sql.Request(tx).input('id', sql.Int, id).input('peso', sql.Decimal(6,2), peso)
      .input('talla', sql.Decimal(6,2), talla).input('pa', sql.NVarChar, n.pa || null)
      .input('fc', sql.Int, n.fc ? Number(n.fc) : null).input('fr', sql.Int, n.fr ? Number(n.fr) : null)
      .input('temp', sql.Decimal(4,1), n.temperatura ? Number(n.temperatura) : null)
      .input('spo', sql.Decimal(5,2), n.saturacion ? Number(n.saturacion) : null)
      .input('gluc', sql.Decimal(7,2), n.glicemia ? Number(n.glicemia) : null)
      .input('imc', sql.Decimal(5,2), imc)
      .query(`INSERT dbo.SignosVitales(ConsultaID,PesoKg,TallaCm,PresionArterial,FrecuenciaCardiaca,FrecuenciaRespiratoria,Temperatura,SaturacionOxigeno,Glicemia,IMC)
      VALUES(@id,@peso,@talla,@pa,@fc,@fr,@temp,@spo,@gluc,@imc)`);
    for (const rec of (Array.isArray(b.recetas) ? b.recetas : [])) {
      if (!rec.medicamento) continue;
      await new sql.Request(tx).input('id', sql.Int, id).input('med', sql.NVarChar, rec.medicamento)
        .input('dosis', sql.NVarChar, rec.dosis || null).input('freq', sql.NVarChar, rec.frecuencia || null)
        .input('dur', sql.NVarChar, rec.duracion || null).input('ind', sql.NVarChar, rec.indicaciones || null)
        .query(`INSERT dbo.Recetas(ConsultaID,Medicamento,Dosis,Frecuencia,Duracion,Indicaciones)
        VALUES(@id,@med,@dosis,@freq,@dur,@ind)`);
    }
    await new sql.Request(tx).input('uid', sql.Int, req.session.user.id).input('id', sql.Int, id)
      .query(`INSERT dbo.Auditoria(UsuarioID,Accion,Entidad,RegistroID) VALUES(@uid,'REGISTRO_CONSULTA','Consultas',@id)`);
    await tx.commit();
    res.status(201).json({ message: 'Consulta guardada en el historial cronológico.', consultaId: id, imc });
  } catch (e) { await tx.rollback(); console.error(e); res.status(400).json({ error: 'No se pudo guardar la consulta.' }); }
});

app.get('/api/consultas/:id/pdf', requireAuth, async (req, res) => {
  try {
    const pool = await getPool(), id = Number(req.params.id), u = req.session.user;
    const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT c.*,p.NombreCompleto AS Paciente,p.Carnet,p.FechaNacimiento,m.NombreCompleto AS Medico,
      m.MatriculaProfesional,sv.PesoKg,sv.TallaCm,sv.PresionArterial,sv.FrecuenciaCardiaca,
      sv.FrecuenciaRespiratoria,sv.Temperatura,sv.SaturacionOxigeno,sv.Glicemia,sv.IMC
      FROM dbo.Consultas c JOIN dbo.Pacientes p ON p.PacienteID=c.PacienteID
      JOIN dbo.Usuarios m ON m.UsuarioID=c.MedicoID LEFT JOIN dbo.SignosVitales sv ON sv.ConsultaID=c.ConsultaID
      WHERE c.ConsultaID=@id`);
    const c = r.recordset[0];
    if (!c) return res.status(404).json({ error: 'Consulta no encontrada.' });
    if (u.rol === 'PACIENTE') {
      const own = await pool.request().input('uid', sql.Int, u.id).input('id', sql.Int, id)
        .query('SELECT 1 AS ok FROM dbo.Consultas c JOIN dbo.Pacientes p ON p.PacienteID=c.PacienteID WHERE c.ConsultaID=@id AND p.UsuarioID=@uid');
      if (!own.recordset.length) return res.status(403).json({ error: 'No tienes acceso a este documento.' });
      return res.status(403).json({ error: 'La descarga e impresión están reservadas al profesional autorizado.' });
    }
    if (u.rol === 'MEDICO' && c.MedicoID !== u.id) return res.status(403).json({ error: 'No tienes acceso a esta consulta.' });
    const meds = await pool.request().input('id', sql.Int, id).query('SELECT * FROM dbo.Recetas WHERE ConsultaID=@id');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="MedClick-consulta-${id}.pdf"`);
    const doc = new PDFDocument({ margin: 48 });
    doc.pipe(res);
    doc.fontSize(22).fillColor('#087fbd').text('MedClick', { continued: true }).fillColor('#172b4d').fontSize(10).text('  |  Historia clínica digital');
    doc.moveDown().fontSize(16).text('REGISTRO DE CONSULTA');
    doc.moveDown().fontSize(10).fillColor('#111');
    const line = (label, value) => doc.font('Helvetica-Bold').text(label, { continued: true }).font('Helvetica').text(` ${value || 'No registrado'}`);
    line('Paciente:', c.Paciente); line('Carnet:', c.Carnet); line('Fecha:', new Date(c.FechaConsulta).toLocaleString('es-BO'));
    line('Profesional:', c.Medico); line('Matrícula:', c.MatriculaProfesional);
    doc.moveDown().font('Helvetica-Bold').text('SIGNOS VITALES');
    doc.font('Helvetica');
    line('Peso (kg):', c.PesoKg); line('Talla (cm):', c.TallaCm); line('Presión arterial:', c.PresionArterial);
    line('Frecuencia cardíaca:', c.FrecuenciaCardiaca); line('Frecuencia respiratoria:', c.FrecuenciaRespiratoria);
    line('Temperatura:', c.Temperatura); line('Saturación O2:', c.SaturacionOxigeno); line('Glicemia:', c.Glicemia); line('IMC:', c.IMC);
    for (const [label, value] of [['Motivo de consulta',c.MotivoConsulta],['Enfermedad actual',c.EnfermedadActual],['Examen físico',c.ExamenFisico],['Diagnóstico',c.Diagnostico],['Tratamiento',c.Tratamiento],['Observaciones',c.Observaciones]]) {
      doc.moveDown(0.7).font('Helvetica-Bold').text(label);
      doc.font('Helvetica').text(value || 'No registrado');
    }
    doc.moveDown().font('Helvetica-Bold').text('RECETA / MEDICAMENTOS');
    doc.font('Helvetica');
    meds.recordset.forEach(x => doc.text(`${x.Medicamento} | Dosis: ${x.Dosis || '-'} | Frecuencia: ${x.Frecuencia || '-'} | Duración: ${x.Duracion || '-'} | ${x.Indicaciones || ''}`));
    doc.moveDown(2).fontSize(9).fillColor('#555').text('Documento generado por MedClick. La información debe ser validada por el profesional responsable.');
    doc.end();
  } catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: 'No se pudo generar el PDF.' }); }
});

app.post('/api/citas', requireAuth, requireRole('PACIENTE'), async (req, res) => {
  try {
    const { medicoId, especialidad, fechaHora, motivo, plataforma, enlace } = req.body;
    if (!medicoId || !especialidad || !fechaHora) return res.status(400).json({ error: 'Completa médico, especialidad y fecha.' });
    const pool = await getPool();
    const p = await pool.request().input('uid', sql.Int, req.session.user.id).query('SELECT PacienteID FROM dbo.Pacientes WHERE UsuarioID=@uid');
    if (!p.recordset.length) return res.status(400).json({ error: 'No se encontró tu ficha de paciente.' });
    await pool.request().input('pid', sql.Int, p.recordset[0].PacienteID).input('mid', sql.Int, Number(medicoId))
      .input('esp', sql.NVarChar, especialidad).input('fecha', sql.DateTime2, new Date(fechaHora))
      .input('motivo', sql.NVarChar, motivo || null).input('plat', sql.NVarChar, plataforma || 'WhatsApp')
      .input('link', sql.NVarChar, enlace || null)
      .query(`INSERT dbo.Citas(PacienteID,MedicoID,Especialidad,FechaHora,Modalidad,Plataforma,EnlaceTeleorientacion,Motivo)
      VALUES(@pid,@mid,@esp,@fecha,'VIRTUAL',@plat,@link,@motivo)`);
    res.status(201).json({ message: 'Solicitud de cita enviada.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudo solicitar la cita.' }); }
});

app.get('/api/citas', requireAuth, async (req, res) => {
  const pool = await getPool(), u = req.session.user;
  let q;
  if (u.rol === 'PACIENTE') q = await pool.request().input('uid', sql.Int, u.id).query(`
    SELECT c.*,m.NombreCompleto AS Medico FROM dbo.Citas c JOIN dbo.Pacientes p ON p.PacienteID=c.PacienteID
    JOIN dbo.Usuarios m ON m.UsuarioID=c.MedicoID WHERE p.UsuarioID=@uid ORDER BY c.FechaHora DESC`);
  else if (u.rol === 'MEDICO') q = await pool.request().input('id', sql.Int, u.id).query(`
    SELECT c.*,p.NombreCompleto AS Paciente FROM dbo.Citas c JOIN dbo.Pacientes p ON p.PacienteID=c.PacienteID
    WHERE c.MedicoID=@id ORDER BY c.FechaHora DESC`);
  else q = await pool.request().query('SELECT * FROM dbo.Citas ORDER BY FechaHora DESC');
  res.json(q.recordset);
});

/* Administración de suscripciones: jamás elimina ni bloquea consultas/historias clínicas. */
app.get('/api/admin/medicos', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT u.UsuarioID,u.NombreCompleto,u.Correo,u.MatriculaProfesional,u.EstadoCuenta,
    s.SuscripcionID,s.Estado AS SuscripcionEstado,s.FechaInicio,s.FechaVencimiento,s.Monto,
    CASE WHEN s.FechaVencimiento < CAST(GETDATE() AS DATE) THEN 'VENCIDO'
         WHEN s.Estado='ACTIVA' THEN 'PAGADO/ACTIVO' ELSE 'PENDIENTE' END AS EstadoPago
    FROM dbo.Usuarios u LEFT JOIN dbo.Suscripciones s ON s.MedicoID=u.UsuarioID
    WHERE u.Rol='MEDICO' ORDER BY u.NombreCompleto`);
  res.json(r.recordset);
});

app.post('/api/admin/pagos', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { medicoId, monto, fechaPago, periodoMeses, metodo, referencia, observacion } = req.body;
    if (!medicoId || !monto || !fechaPago) return res.status(400).json({ error: 'Médico, monto y fecha son obligatorios.' });
    const pool = await getPool(), tx = new sql.Transaction(pool); await tx.begin();
    try {
      const s = await new sql.Request(tx).input('mid', sql.Int, Number(medicoId)).query('SELECT TOP 1 * FROM dbo.Suscripciones WHERE MedicoID=@mid ORDER BY SuscripcionID DESC');
      let sid = s.recordset[0]?.SuscripcionID;
      if (!sid) {
        const ins = await new sql.Request(tx).input('mid', sql.Int, Number(medicoId))
          .query(`INSERT dbo.Suscripciones(MedicoID,Estado) OUTPUT INSERTED.SuscripcionID VALUES(@mid,'PENDIENTE')`);
        sid = ins.recordset[0].SuscripcionID;
      }
      await new sql.Request(tx).input('mid', sql.Int, Number(medicoId)).input('sid', sql.Int, sid)
        .input('monto', sql.Decimal(10,2), Number(monto)).input('fecha', sql.Date, fechaPago)
        .input('meses', sql.Int, Number(periodoMeses || 1)).input('metodo', sql.NVarChar, metodo || null)
        .input('ref', sql.NVarChar, referencia || null).input('obs', sql.NVarChar, observacion || null)
        .input('admin', sql.Int, req.session.user.id)
        .query(`INSERT dbo.Pagos(MedicoID,SuscripcionID,Monto,FechaPago,PeriodoMeses,Metodo,Referencia,Observacion,RegistradoPor)
          VALUES(@mid,@sid,@monto,@fecha,@meses,@metodo,@ref,@obs,@admin)`);
      await new sql.Request(tx).input('sid', sql.Int, sid).input('fecha', sql.Date, fechaPago)
        .input('meses', sql.Int, Number(periodoMeses || 1))
        .query(`UPDATE dbo.Suscripciones SET Estado='ACTIVA',FechaInicio=@fecha,
          FechaVencimiento=DATEADD(MONTH,@meses,@fecha),ActualizadoEn=SYSDATETIME() WHERE SuscripcionID=@sid`);
      await new sql.Request(tx).input('mid', sql.Int, Number(medicoId))
        .query(`UPDATE dbo.Usuarios SET EstadoCuenta='ACTIVO' WHERE UsuarioID=@mid AND Rol='MEDICO'`);
      await tx.commit();
    } catch (e) { await tx.rollback(); throw e; }
    res.status(201).json({ message: 'Pago registrado y suscripción activada.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudo registrar el pago.' }); }
});

app.post('/api/admin/suscripciones/:id/estado', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const allowed = ['ACTIVA','SUSPENDIDA','PENDIENTE'];
  if (!allowed.includes(req.body.estado)) return res.status(400).json({ error: 'Estado no válido.' });
  const pool = await getPool();
  await pool.request().input('id', sql.Int, Number(req.params.id)).input('estado', sql.VarChar, req.body.estado)
    .query('UPDATE dbo.Suscripciones SET Estado=@estado,ActualizadoEn=SYSDATETIME() WHERE SuscripcionID=@id');
  res.json({ message: 'Estado de suscripción actualizado. Los historiales clínicos permanecen conservados.' });
});

app.get('/api/admin/pagos', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query(`SELECT p.*,u.NombreCompleto AS Medico,u.MatriculaProfesional
    FROM dbo.Pagos p JOIN dbo.Usuarios u ON u.UsuarioID=p.MedicoID ORDER BY p.FechaPago DESC`);
  res.json(r.recordset);
});

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Error interno del servidor.' }); });
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`MedClick ejecutándose en http://localhost:${port}`));
