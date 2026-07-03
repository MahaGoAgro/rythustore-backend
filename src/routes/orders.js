const express = require("express");
const prisma  = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");
const log = require("../utils/logger");

const router = express.Router();

router.use(protect);

// ── GET /api/orders ────────────────────────────
// Customer: get own orders
// Admin: get ALL orders
router.get("/", async (req, res) => {
  try {
    const isAdmin = req.user.role === "ADMIN";

    const orders = await prisma.order.findMany({
      where: isAdmin ? {} : { userId: req.user.id },
      include: {
        items: { include: { product: true } },
        user:  isAdmin
          ? { select: { id: true, name: true, email: true, phone: true } }
          : false,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/orders/:id ────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { product: true } },
        user:  { select: { id: true, name: true, email: true } },
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found!" });
    }

    // Customers can only see their own orders
    if (req.user.role !== "ADMIN" && order.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied!" });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/orders ───────────────────────────
// Place a COD order
router.post("/", async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ success: false, message: "Delivery address is required!" });
    }

    const cartItems = await prisma.cartItem.findMany({
      where:   { userId: req.user.id },
      include: { product: true },
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Your cart is empty!" });
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

    const order = await prisma.order.create({
      data: {
        userId:      req.user.id,
        address,
        totalAmount,
        status:      "PLACED",
        paymentMode: "COD",
        items: {
          create: cartItems.map(item => ({
            productId: item.productId,
            quantity:  item.quantity,
            price:     item.product.price,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    // Clear cart after order placed
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });

    res.status(201).json({ success: true, message: "Order placed successfully!", order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/orders/:id/status ─────────────────
// Admin only — update order status
router.put("/:id/status", adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found!" });
    }

    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data:  { status },
      include: {
        items: { include: { product: true } },
        user:  { select: { id: true, name: true, email: true } },
      },
    });

    log.admin("ORDER_STATUS_UPDATED", {
      orderId:   req.params.id,
      oldStatus: order.status,
      newStatus: status,
      adminId:   req.user.id,
    });

    res.json({ success: true, message: `Order status updated to ${status}!`, order: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
