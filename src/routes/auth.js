const { body, validationResult } = require("express-validator");
const { OAuth2Client }           = require("google-auth-library");
const validator = require("validator");
const express   = require("express");
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const crypto    = require("crypto");
const prisma    = require("../config/db");
const { protect } = require("../middleware/auth");

const router      = express.Router();
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// ── Password strength validator ────────────────
const isStrongPassword = (password) => {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  );
};

// ── Helper: Generate JWT ───────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

// ── POST /api/auth/google-callback ────────────
// Receives authorization code from frontend,
// exchanges it with Google for user info, logs user in.
router.post("/google-callback", async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({
        success: false,
        message: "Authorization code and redirect URI are required!"
      });
    }

    // ── Exchange code for tokens ─────────────────
    const { tokens } = await googleClient.getToken({
      code,
      redirect_uri: redirectUri,
    });

    // ── Verify the ID token ──────────────────────
    const ticket = await googleClient.verifyIdToken({
      idToken:  tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Could not get email from Google account!"
      });
    }

    // ── Find or create user ───────────────────────
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: await bcrypt.hash(googleId, 12),
          googleId,
        }
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data:  { googleId }
      });
    }

    // Clear any lockout on successful Google login
    await prisma.user.update({
      where: { id: user.id },
      data:  { failedLoginAttempts: 0, lockedUntil: null }
    });

    const token = generateToken(user);

    res.json({
      success: true,
      message: "Google login successful!",
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error("Google callback error:", err.message);
    res.status(401).json({
      success: false,
      message: "Google sign-in failed. Please try again."
    });
  }
});

// ── POST /api/auth/register ────────────────────
router.post("/register", [
  body("name").notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email required"),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const name     = validator.escape(req.body.name.trim());
    const email    = validator.normalizeEmail(req.body.email.trim());
    const phone    = req.body.phone ? validator.escape(req.body.phone.trim()) : null;
    const { password } = req.body;

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must have at least 8 characters, one uppercase letter, one number, and one special character."
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already registered. Please login!"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, phone, password: hashedPassword }
    });

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: "Account created successfully!",
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/login ───────────────────────
router.post("/login", [
  body("email").isEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password is required"),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const email    = validator.normalizeEmail(req.body.email.trim());
    const password = req.body.password;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password!" });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`
      });
    }

    if (user.googleId && !user.password) {
      return res.status(400).json({
        success: false,
        message: "This account uses Google Sign-In. Please click 'Continue with Google'."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      const failedAttempts = (user.failedLoginAttempts || 0) + 1;
      const updateData = { failedLoginAttempts: failedAttempts };

      if (failedAttempts >= 5) {
        updateData.lockedUntil         = new Date(Date.now() + 15 * 60 * 1000);
        updateData.failedLoginAttempts = 0;
        await prisma.user.update({ where: { id: user.id }, data: updateData });
        return res.status(429).json({
          success: false,
          message: "Too many failed attempts. Account locked for 15 minutes."
        });
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });
      const attemptsLeft = 5 - failedAttempts;
      return res.status(401).json({
        success: false,
        message: `Invalid email or password! ${attemptsLeft} attempt${attemptsLeft > 1 ? "s" : ""} remaining.`
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data:  { failedLoginAttempts: 0, lockedUntil: null }
    });

    const token = generateToken(user);

    res.json({
      success: true,
      message: "Login successful!",
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/auth/profile ──────────────────────
router.get("/profile", protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true,
        phone: true, role: true, createdAt: true,
        addresses: true
      }
    });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/auth/profile ──────────────────────
router.put("/profile", protect, async (req, res) => {
  try {
    const name  = req.body.name  ? validator.escape(req.body.name.trim())  : undefined;
    const phone = req.body.phone ? validator.escape(req.body.phone.trim()) : undefined;

    if (req.body.name !== undefined && !name) {
      return res.status(400).json({ success: false, message: "Name cannot be empty!" });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data:  { name, phone },
      select: { id: true, name: true, email: true, phone: true }
    });

    res.json({ success: true, message: "Profile updated!", user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/forgot-password ────────────
router.post("/forgot-password", async (req, res) => {
  try {
    const email = validator.normalizeEmail((req.body.email || "").trim());

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required!" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ success: true });

    const resetToken   = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordResetToken: resetToken, passwordResetExpires: resetExpires }
    });

    const resetLink = `${process.env.FRONTEND_URL}/pages/reset-password.html?token=${resetToken}`;
    console.log(`[DEV] Password reset link for ${email}: ${resetLink}`);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/reset-password ─────────────
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: "Token and password are required!" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must have at least 8 characters, one uppercase letter, one number, and one special character."
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken:   token,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or has expired."
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password:             await bcrypt.hash(password, 12),
        passwordResetToken:   null,
        passwordResetExpires: null,
        failedLoginAttempts:  0,
        lockedUntil:          null,
      }
    });

    res.json({ success: true, message: "Password reset successfully! You can now login." });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
