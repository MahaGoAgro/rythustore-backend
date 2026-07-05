const express   = require("express");
const validator = require("validator");
const prisma    = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");
const { getCached, invalidateCache } = require("../utils/cache");

const router = express.Router();

const CACHE_KEY = "crop-prices";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const calcChange = (newPrice, previousPrice) => {
  if (!previousPrice || previousPrice === 0) return 0;
  return Math.round(((newPrice - previousPrice) / previousPrice) * 100 * 10) / 10;
};

// ── GET /api/crop-prices ───────────────────────
router.get("/", async (req, res) => {
  try {
    const crops = await getCached(
      CACHE_KEY,
      CACHE_TTL,
      () => prisma.cropPrice.findMany({ orderBy: { name: "asc" } })
    );
    res.json({ success: true, crops });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/crop-prices ──────────────────────
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const name  = validator.escape((req.body.name || "").trim());
    const unit  = validator.escape((req.body.unit || "quintal").trim());
    const price = parseFloat(req.body.price) || 0;

    if (!name || price <= 0) {
      return res.status(400).json({ success: false, message: "Crop name and valid price required!" });
    }

    const existing = await prisma.cropPrice.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ success: false, message: `${name} already exists! Use Edit to update.` });
    }

    const crop = await prisma.cropPrice.create({
      data: { name, price, previousPrice: null, unit, change: 0 }
    });

    invalidateCache(CACHE_KEY); // clear cache after write
    res.status(201).json({ success: true, crop });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/crop-prices/:id ───────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const newPrice = parseFloat(req.body.price);
    const unit     = req.body.unit ? validator.escape(req.body.unit.trim()) : undefined;

    if (!newPrice || newPrice <= 0) {
      return res.status(400).json({ success: false, message: "Please enter a valid price!" });
    }

    const existing = await prisma.cropPrice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: "Crop not found!" });

    const change = calcChange(newPrice, existing.price);

    const crop = await prisma.cropPrice.update({
      where: { id: req.params.id },
      data:  { price: newPrice, previousPrice: existing.price, change, unit },
    });

    invalidateCache(CACHE_KEY); // clear cache after write
    res.json({ success: true, crop, change });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/crop-prices/:id ────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await prisma.cropPrice.delete({ where: { id: req.params.id } });
    invalidateCache(CACHE_KEY);
    res.json({ success: true, message: "Crop deleted!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
