const express  = require("express");
const validator = require("validator");
const prisma   = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");
const log      = require("../utils/logger");

const router = express.Router();

// ── GET /api/products ──────────────────────────
// Query params:
//   search=tomato
//   category=SEEDS
//   minPrice=100&maxPrice=500
//   sort=price_asc|price_desc|rating|newest|discount
//   flashSale=true
//   bestseller=true
router.get("/", async (req, res) => {
  try {
    const {
      category, search, flashSale, bestseller,
      minPrice, maxPrice, sort
    } = req.query;

    const where = { inStock: true };

    // Category filter
    if (category) {
      where.category = category.toUpperCase();
    }

    // Search — name, brand, AND description
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { desc:  { contains: search, mode: "insensitive" } },
      ];
    }

    // Flash sale filter
    if (flashSale === "true") {
      where.flashSaleEndsAt = { gt: new Date() };
    }

    // Bestseller filter
    if (bestseller === "true") {
      where.isBestseller = true;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    // Sort options
    let orderBy = { rating: "desc" }; // default
    switch (sort) {
      case "price_asc":  orderBy = { price: "asc" };      break;
      case "price_desc": orderBy = { price: "desc" };     break;
      case "rating":     orderBy = { rating: "desc" };    break;
      case "newest":     orderBy = { createdAt: "desc" }; break;
      case "discount":   orderBy = { discount: "desc" };  break;
    }

    const products = await prisma.product.findMany({ where, orderBy });

    // Get min/max price range for the filter UI
    const priceStats = await prisma.product.aggregate({
      where:  { inStock: true, ...(category ? { category: category.toUpperCase() } : {}) },
      _min:   { price: true },
      _max:   { price: true },
    });

    res.json({
      success: true,
      count:   products.length,
      products,
      priceRange: {
        min: priceStats._min.price || 0,
        max: priceStats._max.price || 10000,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/:id ──────────────────────
router.get("/:id", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found!" });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/products ─────────────────────────
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const {
      category, price, originalPrice, discount,
      unit, imageUrl, badge, rating, reviews,
      isBestseller, flashSaleEndsAt
    } = req.body;

    const name  = validator.escape(req.body.name?.trim()  || "");
    const brand = validator.escape(req.body.brand?.trim() || "");
    const desc  = validator.escape(req.body.desc?.trim()  || "");

    if (!name || !brand || !category || !price || !unit || !desc) {
      return res.status(400).json({ success: false, message: "Please fill all required fields!" });
    }

    const validCategories = ["SEEDS", "PESTICIDES", "INSECTICIDES", "ORGANIC"];
    if (!validCategories.includes(category.toUpperCase())) {
      return res.status(400).json({ success: false, message: "Invalid category!" });
    }

    const product = await prisma.product.create({
      data: {
        name, brand, desc,
        category:        category.toUpperCase(),
        price:            parseFloat(price),
        originalPrice:    originalPrice ? parseFloat(originalPrice) : null,
        discount:         discount      ? parseInt(discount)        : 0,
        isBestseller:     isBestseller === true || isBestseller === "true",
        flashSaleEndsAt:  flashSaleEndsAt ? new Date(flashSaleEndsAt) : null,
        unit,
        imageUrl: imageUrl || null,
        badge:    badge    ? validator.escape(badge.trim()) : null,
        rating:   rating   ? parseFloat(rating) : 0,
        reviews:  reviews  ? parseInt(reviews)  : 0,
      }
    });

    log.admin("PRODUCT_CREATED", { name: product.name, adminId: req.user.id });

    res.status(201).json({ success: true, message: "Product added!", product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/products/:id ──────────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found!" });

    const name  = req.body.name  ? validator.escape(req.body.name.trim())  : undefined;
    const brand = req.body.brand ? validator.escape(req.body.brand.trim()) : undefined;
    const desc  = req.body.desc  ? validator.escape(req.body.desc.trim())  : undefined;
    const badge = req.body.badge ? validator.escape(req.body.badge.trim()) : null;

    const updated = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name, brand, desc, badge,
        category:        req.body.category ? req.body.category.toUpperCase() : undefined,
        price:           req.body.price    ? parseFloat(req.body.price)      : undefined,
        originalPrice:   req.body.originalPrice ? parseFloat(req.body.originalPrice) : null,
        discount:        req.body.discount  ? parseInt(req.body.discount)    : 0,
        isBestseller:    req.body.isBestseller === true || req.body.isBestseller === "true",
        flashSaleEndsAt: req.body.flashSaleEndsAt ? new Date(req.body.flashSaleEndsAt) : null,
        unit:            req.body.unit,
        imageUrl:        req.body.imageUrl || null,
        rating:          req.body.rating  ? parseFloat(req.body.rating)  : undefined,
        reviews:         req.body.reviews ? parseInt(req.body.reviews)   : undefined,
      }
    });

    log.admin("PRODUCT_UPDATED", { productId: req.params.id, adminId: req.user.id });

    res.json({ success: true, message: "Product updated!", product: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/products/:id ───────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found!" });
    await prisma.product.delete({ where: { id: req.params.id } });
    log.admin("PRODUCT_DELETED", { productId: req.params.id, adminId: req.user.id });
    res.json({ success: true, message: "Product deleted!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
