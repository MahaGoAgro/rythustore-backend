const express = require("express");
const validator = require("validator");
const prisma = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.use(protect);

// ── GET /api/orders ────────────────────────────
// Get my all orders
router.get("/", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, count: orders.length, orders });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/orders/:id ────────────────────────
// Get single order details
router.get("/:id", async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: { include: { product: true } } }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found!" });
    }

    res.json({ success: true, order });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/orders ───────────────────────────
// Place order from cart
router.post("/", async (req, res) => {
  try {
    // ── Sanitize address ──────────────────────────
    const address = validator.escape(req.body.address?.trim() || "");

    if (!address) {
      return res.status(400).json({ success: false, message: "Delivery address is required!" });
    }

    // 1. Get user's cart
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { product: true }
    });

    // 2. Check cart is not empty
    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Your cart is empty!" });
    }

    // 3. Calculate total amount
    const totalAmount = cartItems.reduce((sum, item) => {
      return sum + (item.product.price * item.quantity);
    }, 0);

    // 4. Create order + clear cart in one transaction
    const order = await prisma.$transaction(async (tx) => {

      const newOrder = await tx.order.create({
        data: {
          userId: req.user.id,
          address,
          totalAmount,
          items: {
            create: cartItems.map((item) => ({
              productId: item.productId,
              quantity:  item.quantity,
              price:     item.product.price
            }))
          }
        },
        include: { items: { include: { product: true } } }
      });

      await tx.cartItem.deleteMany({ where: { userId: req.user.id } });

      return newOrder;
    });

    res.status(201).json({
      success: true,
      message: "Order placed successfully!",
      order
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/orders/:id/status ─────────────────
// Update order status (Admin)
router.put("/:id/status", adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status!" });
    }

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json({ success: true, message: "Order status updated!", order });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
