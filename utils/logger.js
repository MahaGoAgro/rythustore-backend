// ── Logger utility ─────────────────────────────
// Simple structured logger that outputs to console
// Railway captures all console output in Deploy Logs

const log = {

  // General info
  info: (event, data = {}) => {
    console.log(JSON.stringify({
      level:     "INFO",
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

  // Security events (login failures, lockouts, etc)
  security: (event, data = {}) => {
    console.warn(JSON.stringify({
      level:     "SECURITY",
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

  // Errors
  error: (event, err, data = {}) => {
    console.error(JSON.stringify({
      level:     "ERROR",
      event,
      message:   err?.message || err,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

  // Payment events
  payment: (event, data = {}) => {
    console.log(JSON.stringify({
      level:     "PAYMENT",
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

  // Admin actions
  admin: (event, data = {}) => {
    console.log(JSON.stringify({
      level:     "ADMIN",
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

};

module.exports = log;
