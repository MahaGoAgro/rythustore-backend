const express   = require("express");
const validator = require("validator");
const prisma    = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── Helper: calculate change % ─────────────────
const calcChange = (newPrice, previousPrice) => {
  if (!previousPrice || previousPrice === 0) return 0;
  const change = ((newPrice - previousPrice) / previousPrice) * 100;
  return Math.round(change * 10) / 10; // round to 1 decimal
};

// ── GET /api/crop-prices ───────────────────────
// Public — home page ticker reads from here
router.get("/", async (req, res) => {
  try {
    const crops = await prisma.cropPrice.findMany({
      orderBy: { name: "asc" }
    });
    res.json({ success: true, crops });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/crop-prices ──────────────────────
// Admin only — add a new crop
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const name  = validator.escape((req.body.name || "").trim());
    const unit  = validator.escape((req.body.unit || "quintal").trim());
    const price = parseFloat(req.body.price) || 0;

    if (!name || price <= 0) {
      return res.status(400).json({
        success: false,
        message: "Crop name and a valid price are required!"
      });
    }

    // Check if crop already exists
    const existing = await prisma.cropPrice.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `${name} already exists! Use Edit to update its price.`
      });
    }

    const crop = await prisma.cropPrice.create({
      data: {
        name,
        price,
        previousPrice: null, // no previous price yet for new crops
        unit,
        change: 0,
      }
    });

    res.status(201).json({ success: true, crop });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/crop-prices/:id ───────────────────
// Admin only — update price (auto-calculates change %)
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const newPrice = parseFloat(req.body.price);
    const unit     = req.body.unit ? validator.escape(req.body.unit.trim()) : undefined;

    if (!newPrice || newPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid price!"
      });
    }

    // Get current price to store as previousPrice
    const existing = await prisma.cropPrice.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Crop not found!" });
    }

    // Auto-calculate change %
    const change = calcChange(newPrice, existing.price);

    const crop = await prisma.cropPrice.update({
      where: { id: req.params.id },
      data: {
        price:         newPrice,
        previousPrice: existing.price, // today's price becomes yesterday's
        change,
        unit,
      }
    });

    res.json({ success: true, crop, change });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/crop-prices/:id ────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await prisma.cropPrice.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Crop deleted!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
