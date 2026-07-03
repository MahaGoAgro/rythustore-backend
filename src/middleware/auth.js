const jwt    = require("jsonwebtoken");
const prisma = require("../config/db");

// ── protect ────────────────────────────────────
// Verifies JWT token AND checks tokenVersion matches
// database — this means logged-out tokens are instantly
// rejected even if they haven't expired yet
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. Please login!"
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again!"
      });
    }

    // Check user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id:           true,
        name:         true,
        email:        true,
        role:         true,
        tokenVersion: true,
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists!"
      });
    }

    // ── Token version check ──────────────────────
    // If token version in JWT doesn't match database,
    // the token has been invalidated (logout / password reset)
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: "Session invalidated. Please login again!"
      });
    }

    req.user = user;
    next();

  } catch (err) {
    res.status(401).json({
      success: false,
      message: "Not authorized. Please login!"
    });
  }
};

// ── adminOnly ──────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Access denied! Admin only."
    });
  }
  next();
};

module.exports = { protect, adminOnly };
