const express   = require("express");
const cors      = require("cors");
const dotenv    = require("dotenv");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");

dotenv.config();

const app = express();

// ── Security Middleware ─────────────────────────
app.use(helmet());          // secure HTTP headers

// ── CORS — only allow your own frontend ─────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
}));

app.use(express.json({ limit: "10mb" })); // allow base64 images but cap size
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting — General API ─────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                 // max 100 requests per IP per window
  message: {
    success: false,
    message: "Too many requests! Please try again later."
  }
});
app.use("/api", generalLimiter);

// ── Rate Limiting — Strict for Login/Register ───
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // only 5 attempts per IP
  message: {
    success: false,
    message: "Too many login attempts! Please try again after 15 minutes."
  }
});
app.use("/api/auth/login",    authLimiter);
app.use("/api/auth/register", authLimiter);

// ── Routes ───────────────────────────────────────
app.use("/api/auth",     require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/cart",     require("./routes/cart"));
app.use("/api/orders",   require("./routes/orders"));
app.use("/api/addresses", require("./routes/addresses"));
app.use("/api/weather", require("./routes/weather"));
// ── Health Check ───────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "🌾 RythuStore API is running!",
    status: "OK"
  });
});

// ── 404 Handler ────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found!"
  });
});

// ── Global Error Handler ───────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production"
      ? "Something went wrong!"
      : err.message
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌾 RythuStore server started on http://localhost:${PORT}`);
});
