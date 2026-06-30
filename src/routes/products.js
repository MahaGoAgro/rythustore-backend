const express = require("express");
const validator = require("validator");
const prisma = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/products ──────────────────────────────────────────
// Query: ?category=SEEDS&search=tomato&flashSale=true&bestseller=true
router.get("/", async (req, res) => {
  try {
    const { category, search, flashSale, bestseller } = req.query;

    const where = { inStock: true };

    if (category) {
      where.category = category.toUpperCase();
    }

    if (search) {
      where.OR = [
        { name:  { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
      ];
    }

    if (flashSale === "true") {
      where.flashSaleEndsAt = { gt: new Date() };
    }

    if (bestseller === "true") {
      where.isBestseller = true;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { rating: "desc" }
    });

    res.json({
      success: true,
      count: products.length,
      products
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/:id ──────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    res.json({ success: true, product });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/products ─────────────────────────────────────────
// Add new product (must be logged in)
router.post("/", protect, async (req, res) => {
  try {
    const {
      category, price, originalPrice, discount,
      unit, imageUrl, badge, rating, reviews,
      isBestseller, flashSaleEndsAt
    } = req.body;

    // ── Sanitize text fields ─────────────────────
    const name  = validator.escape(req.body.name?.trim()  || "");
    const brand = validator.escape(req.body.brand?.trim() || "");
    const desc  = validator.escape(req.body.desc?.trim()  || "");

    // Check required fields
    if (!name || !brand || !category || !price || !unit || !desc) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields!"
      });
    }

    // Check valid category
    const validCategories = ["SEEDS", "PESTICIDES", "INSECTICIDES", "ORGANIC"];
    if (!validCategories.includes(category.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Category must be SEEDS, PESTICIDES, INSECTICIDES or ORGANIC"
      });
    }

    const product = await prisma.product.create({
      data: {
        name,
        brand,
        category:        category.toUpperCase(),
        price:            parseFloat(price),
        originalPrice:    originalPrice ? parseFloat(originalPrice) : null,
        discount:         discount      ? parseInt(discount)        : 0,
        isBestseller:     isBestseller === true || isBestseller === "true",
        flashSaleEndsAt:  flashSaleEndsAt ? new Date(flashSaleEndsAt) : null,
        unit,
        desc,
        imageUrl: imageUrl || null,
        badge:    badge    ? validator.escape(badge.trim()) : null,
        rating:   rating   ? parseFloat(rating) : 0,
        reviews:  reviews  ? parseInt(reviews)  : 0,
      }
    });

    res.status(201).json({
      success: true,
      message: "Product added successfully!",
      product
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/products/:id ──────────────────────────────────────
// Update product (must be logged in)
router.put("/:id", protect, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    // ── Sanitize text fields if present ──────────
    const name  = req.body.name  ? validator.escape(req.body.name.trim())  : undefined;
    const brand = req.body.brand ? validator.escape(req.body.brand.trim()) : undefined;
    const desc  = req.body.desc  ? validator.escape(req.body.desc.trim())  : undefined;
    const badge = req.body.badge ? validator.escape(req.body.badge.trim()) : null;

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name,
        brand,
        desc,
        badge,
        category: req.body.category
          ? req.body.category.toUpperCase()
          : undefined,
        price: req.body.price
          ? parseFloat(req.body.price)
          : undefined,
        originalPrice: req.body.originalPrice
          ? parseFloat(req.body.originalPrice)
          : null,
        discount: req.body.discount
          ? parseInt(req.body.discount)
          : 0,
        isBestseller: req.body.isBestseller === true || req.body.isBestseller === "true",
        flashSaleEndsAt: req.body.flashSaleEndsAt
          ? new Date(req.body.flashSaleEndsAt)
          : null,
        unit:     req.body.unit,
        imageUrl: req.body.imageUrl || null,
        rating: req.body.rating
          ? parseFloat(req.body.rating)
          : undefined,
        reviews: req.body.reviews
          ? parseInt(req.body.reviews)
          : undefined,
      }
    });

    res.json({
      success: true,
      message: "Product updated!",
      product: updated
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/products/:id ───────────────────────────────────
// Delete product (must be logged in)
router.delete("/:id", protect, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found!" });
    }

    await prisma.product.delete({ where: { id: req.params.id } });

    res.json({ success: true, message: "Product deleted!" });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
