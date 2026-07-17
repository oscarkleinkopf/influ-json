const expressSession = require('express-session');

const DEFAULT_PIN = process.env.STUDIO_PIN || '1234';

// Setup session middleware helper
const sessionMiddleware = expressSession({
  secret: 'influ-json-super-secret-key-1337',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: false // Set to true if running over https
  }
});

function requireAuth(req, res, next) {
  // Allow bypassing auth if PIN is set to empty or disabled
  if (!DEFAULT_PIN || String(DEFAULT_PIN).trim() === '') {
    return next();
  }

  // Check session or Authorization header
  if (req.session && req.session.authenticated) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token === String(DEFAULT_PIN).trim()) {
      if (req.session) req.session.authenticated = true;
      return next();
    }
  }

  res.status(401).json({ success: false, message: 'Acceso denegado. PIN inválido o sesión expirada.' });
}

module.exports = {
  sessionMiddleware,
  requireAuth,
  verifyPin(pin) {
    if (!pin) return false;
    return String(pin).trim() === String(DEFAULT_PIN).trim();
  }
};
