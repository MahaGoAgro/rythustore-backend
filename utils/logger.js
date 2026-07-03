// ── Logger utility ─────────────────────────────
const log = {

  info: (event, data = {}) => {
    console.log(JSON.stringify({
      level:     "INFO",
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

  security: (event, data = {}) => {
    console.warn(JSON.stringify({
      level:     "SECURITY",
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

  error: (event, err, data = {}) => {
    console.error(JSON.stringify({
      level:     "ERROR",
      event,
      message:   err?.message || err,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

  payment: (event, data = {}) => {
    console.log(JSON.stringify({
      level:     "PAYMENT",
      event,
      timestamp: new Date().toISOString(),
      ...data
    }));
  },

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