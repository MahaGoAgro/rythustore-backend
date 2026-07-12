const express = require("express");
const prisma  = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/variants/:productId ───────────────
// Get all variants for a product
router.get("/:productId", async (req, res) => {
  try {
    const variants = await prisma.productVariant.findMany({
      where:   { productId: req.params.productId },
      orderBy: { price: "asc" },
    });
    res.json({ success: true, variants });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/variants/:productId ──────────────
// Admin only — add a variant to a product
router.post("/:productId", protect, adminOnly, async (req, res) => {
  try {
    const { size, price, originalPrice, discount, inStock } = req.body;

    if (!size || !price) {
      return res.status(400).json({
        success: false,
        message: "Size and price are required!"
      });
    }

    // Check product exists
    const product = await prisma.product.findUnique({
      where: { id: req.params.productId }
    });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId:     req.params.productId,
        size:          size.trim(),
        price:         parseFloat(price),
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        discount:      discount ? parseInt(discount) : 0,
        inStock:       inStock !== false,
      }
    });

    res.status(201).json({ success: true, variant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/variants/:id ──────────────────────
// Admin only — update a variant
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { size, price, originalPrice, discount, inStock } = req.body;

    const variant = await prisma.productVariant.update({
      where: { id: req.params.id },
      data: {
        size:          size?.trim(),
        price:         price ? parseFloat(price) : undefined,
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        discount:      discount !== undefined ? parseInt(discount) : undefined,
        inStock:       inStock !== undefined ? inStock : undefined,
      }
    });

    res.json({ success: true, variant });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/variants/:id ───────────────────
// Admin only — delete a variant
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await prisma.productVariant.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Variant deleted!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
