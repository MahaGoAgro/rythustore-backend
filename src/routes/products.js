const express = require("express");
const prisma  = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/products ──────────────────────────
router.get("/", async (req, res) => {
  try {
    const { category, search, flashSale, bestseller, minPrice, maxPrice, sort } = req.query;
     const products = await prisma.product.findMany({
     where,
     orderBy,
     include: { variants: { orderBy: { price: "asc" } } }  // ← add this
   });
    const where = { inStock: true };

    if (category)           where.category      = category.toUpperCase();
    if (flashSale === "true") where.flashSaleEndsAt = { gt: new Date() };
    if (bestseller === "true") where.isBestseller  = true;

    if (search) {
      where.OR = [
        { name:  { contains: search, mode: "insensitive" } },
        { brand: { contains: search, mode: "insensitive" } },
        { desc:  { contains: search, mode: "insensitive" } },
      ];
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    let orderBy = { rating: "desc" };
    if (sort === "price_asc")  orderBy = { price: "asc" };
    if (sort === "price_desc") orderBy = { price: "desc" };
    if (sort === "newest")     orderBy = { createdAt: "desc" };
    if (sort === "discount")   orderBy = { discount: "desc" };

    const products = await prisma.product.findMany({ where, orderBy });

    res.json({ success: true, count: products.length, products });

  } catch (err) {
    console.error("Products GET error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/products/:id ──────────────────────
router.get("/:id", async (req, res) => {
   const product = await prisma.product.findUnique({
     where: { id: req.params.id },
     include: { variants: { orderBy: { price: "asc" } } }  // ← add this
   });
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
    const { name, brand, category, price, originalPrice, discount,
            isBestseller, flashSaleEndsAt, unit, desc, imageUrl, badge, rating, reviews } = req.body;

    if (!name || !brand || !category || !price || !unit || !desc) {
      return res.status(400).json({ success: false, message: "Please fill all required fields!" });
    }

    const product = await prisma.product.create({
      data: {
        name, brand, desc,
        category:       category.toUpperCase(),
        price:          parseFloat(price),
        originalPrice:  originalPrice ? parseFloat(originalPrice) : null,
        discount:       discount      ? parseInt(discount)        : 0,
        isBestseller:   isBestseller === true || isBestseller === "true",
        flashSaleEndsAt: flashSaleEndsAt ? new Date(flashSaleEndsAt) : null,
        unit,
        imageUrl: imageUrl || null,
        badge:    badge    || null,
        rating:   rating   ? parseFloat(rating) : 0,
        reviews:  reviews  ? parseInt(reviews)  : 0,
      }
    });

    res.status(201).json({ success: true, message: "Product added!", product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/products/:id ──────────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { name, brand, category, price, originalPrice, discount,
            isBestseller, flashSaleEndsAt, unit, desc, imageUrl, badge, rating, reviews } = req.body;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name, brand, desc,
        category:       category ? category.toUpperCase() : undefined,
        price:          price    ? parseFloat(price)      : undefined,
        originalPrice:  originalPrice ? parseFloat(originalPrice) : null,
        discount:       discount ? parseInt(discount)     : 0,
        isBestseller:   isBestseller === true || isBestseller === "true",
        flashSaleEndsAt: flashSaleEndsAt ? new Date(flashSaleEndsAt) : null,
        unit,
        imageUrl: imageUrl || null,
        badge:    badge    || null,
        rating:   rating   ? parseFloat(rating) : undefined,
        reviews:  reviews  ? parseInt(reviews)  : undefined,
      }
    });

    res.json({ success: true, message: "Product updated!", product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/products/:id ───────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Product deleted!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;