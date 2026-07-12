const express = require("express");
const prisma = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();

// All cart routes need login
router.use(protect);

// ── GET /api/cart ──────────────────────────────
// Get my cart items
router.get("/", async (req, res) => {
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { product: true }
    });

    const total = items.reduce((sum, item) => {
      return sum + (item.product.price * item.quantity);
    }, 0);

    res.json({
      success: true,
      count: items.length,
      total: total,
      items
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/cart/add ─────────────────────────
// Add product to cart
router.post("/add", async (req, res) => {
  try {
    const { productId, quantity = 1, variantId, variantSize } = req.body;  // ← add variantId, variantSize

    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required!" });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found!" });

    // If variant selected, validate it exists
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) return res.status(404).json({ success: false, message: "Variant not found!" });
    }

    // Include variantId in unique check so same product different variants = different cart items
    const existing = await prisma.cartItem.findFirst({
      where: {
        userId:    req.user.id,
        productId,
        variantId: variantId || null,
      }
    });

    let cartItem;
    if (existing) {
      cartItem = await prisma.cartItem.update({
        where:   { id: existing.id },
        data:    { quantity: existing.quantity + quantity },
        include: { product: true },
      });
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          userId:      req.user.id,
          productId,
          quantity,
          variantId:   variantId   || null,
          variantSize: variantSize || null,
        },
        include: { product: true },
      });
    }

    res.json({ success: true, message: "Added to cart!", cartItem });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/cart/:id ──────────────────────────
// Update quantity
router.put("/:id", async (req, res) => {
  try {
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: "Quantity must be at least 1!" });
    }

    const cartItem = await prisma.cartItem.update({
      where: { id: req.params.id },
      data: { quantity },
      include: { product: true }
    });

    res.json({ success: true, message: "Cart updated!", cartItem });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/cart/:id ───────────────────────
// Remove single item from cart
router.delete("/:id", async (req, res) => {
  try {
    await prisma.cartItem.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Item removed from cart!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/cart ───────────────────────────
// Clear entire cart
router.delete("/", async (req, res) => {
  try {
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });
    res.json({ success: true, message: "Cart cleared!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


module.exports = router;
