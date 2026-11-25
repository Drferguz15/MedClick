function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }
    next();
  };
}
function requireActiveDoctor(req, res, next) {
  const u = req.session.user;
  if (!u || u.rol !== 'MEDICO') return res.status(403).json({ error: 'Acceso exclusivo para médicos.' });
  if (u.estadoCuenta !== 'ACTIVO' || u.suscripcionEstado !== 'ACTIVA' ||
      (u.fechaVencimiento && new Date(u.fechaVencimiento) < new Date())) {
    return res.status(403).json({ error: 'Tu suscripción no está activa. Contacta al administrador. Los historiales clínicos se conservan.' });
  }
  next();
}
module.exports = { requireAuth, requireRole, requireActiveDoctor };
