const express     = require("express");
const helmet      = require("helmet");
const cors        = require("cors");
const rateLimit   = require("express-rate-limit");
const log         = require("../utils/logger")

const app = express();

// ── Trust proxy (Railway sits behind one) ──────
app.set("trust proxy", 1);

// ── Security headers ───────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
}));

// ── Body parser with size limit ────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ── Request logger ─────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    log.info("REQUEST", {
      method: req.method,
      path:   req.path,
      ip:     req.ip,
    });
  }
  next();
});

// ── Rate limiters ──────────────────────────────

// Auth routes — strict (5 requests per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      5,
  message:  { success: false, message: "Too many attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// General API routes — moderate (100 requests per 15 min)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { success: false, message: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Upload route — very strict (10 per hour, images are expensive)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      10,
  message:  { success: false, message: "Too many uploads. Please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Payment route — strict (20 per hour)
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  { success: false, message: "Too many payment attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Routes ─────────────────────────────────────
app.use("/api/auth",        authLimiter,    require("./routes/auth"));
app.use("/api/products",    apiLimiter,     require("./routes/products"));
app.use("/api/cart",        apiLimiter,     require("./routes/cart"));
app.use("/api/orders",      apiLimiter,     require("./routes/orders"));
app.use("/api/addresses",   apiLimiter,     require("./routes/addresses"));
app.use("/api/weather",     apiLimiter,     require("./routes/weather"));
app.use("/api/upload",      uploadLimiter,  require("./routes/upload"));
app.use("/api/payments",    paymentLimiter, require("./routes/payments"));
app.use("/api/crop-prices", apiLimiter,     require("./routes/crop-prices"));

// ── Health check ───────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "🌾 RythuStore API is running!",
    status:  "OK",
    version: "1.0.0",
  });
});

// ── Global error handler ───────────────────────
app.use((err, req, res, next) => {
  log.error("UNHANDLED_ERROR", err, { path: req.path });
  res.status(500).json({ success: false, message: "Something went wrong!" });
});

// ── Start server ───────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  log.info("SERVER_START", { port: PORT, env: process.env.NODE_ENV });
  console.log(`🌾 RythuStore server started on http://localhost:${PORT}`);
});
