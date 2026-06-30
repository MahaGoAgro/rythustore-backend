const {body, validationResult} = require("express-validator");
const validator = require("validator");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();

// ── Helper: Generate Token ─────────────────────
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

// ── POST /api/auth/register ────────────────────
router.post("/register", [
  body("name").notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email required"),
  body("password").isLength({ min: 6 }).withMessage("Password min 6 characters"),
], async (req, res) => {
  try {
    // ── Check validation errors first ────────────
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    // ── Sanitize text inputs ──────────────────────
    const name  = validator.escape(req.body.name.trim());
    const email = validator.normalizeEmail(req.body.email.trim());
    const phone = req.body.phone ? validator.escape(req.body.phone.trim()) : null;
    const { password } = req.body;

    // 2. Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already registered. Please login!"
      });
    }

    // 3. Encrypt the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Save user to database
    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword
      }
    });

    // 5. Generate token
    const token = generateToken(user);

    // 6. Send response
    res.status(201).json({
      success: true,
      message: "Account created successfully!",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// ── POST /api/auth/login ───────────────────────
router.post("/login", [
  body("email").isEmail().withMessage("Valid email required"),
  body("password").notEmpty().withMessage("Password is required"),
], async (req, res) => {
  try {
    // ── Check validation errors first ────────────
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    // ── Sanitize email ────────────────────────────
    const email    = validator.normalizeEmail(req.body.email.trim());
    const password = req.body.password;

    // 2. Find user in database
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password!"
      });
    }

    // 3. Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password!"
      });
    }

    // 4. Generate token
    const token = generateToken(user);

    // 5. Send response
    res.json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// ── GET /api/auth/profile ──────────────────────
router.get("/profile", protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        addresses: true
      }
    });

    res.json({ success: true, user });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// ── PUT /api/auth/profile ──────────────────────
// Update my name / phone
router.put("/profile", protect, async (req, res) => {
  try {
    const name  = req.body.name  ? validator.escape(req.body.name.trim())  : undefined;
    const phone = req.body.phone ? validator.escape(req.body.phone.trim()) : undefined;

    if (req.body.name !== undefined && !name) {
      return res.status(400).json({
        success: false,
        message: "Name cannot be empty!"
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, phone },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true
      }
    });

    res.json({
      success: true,
      message: "Profile updated!",
      user
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;