const express  = require("express");
const Razorpay = require("razorpay");
const crypto   = require("crypto");
const prisma   = require("../config/db");
const { protect } = require("../middleware/auth");

const router = express.Router();

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ── POST /api/payments/create-order ───────────
router.post("/create-order", protect, async (req, res) => {
  try {
    const { amount, currency = "INR" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Valid amount is required!" });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount:  Math.round(amount * 100), // paise
      currency,
      receipt: `receipt_${Date.now()}`,
    });

    res.json({
      success:  true,
      orderId:  razorpayOrder.id,
      amount:   razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("Razorpay create order error:", err);
    res.status(500).json({ success: false, message: "Could not create payment order!" });
  }
});

// ── POST /api/payments/verify ──────────────────
router.post("/verify", protect, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      address,
      cartItems,
      totalAmount,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification data missing!" });
    }

    // Verify HMAC-SHA256 signature
    const body     = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed!" });
    }

    // Signature valid — create order in database
    const order = await prisma.order.create({
      data: {
        userId:      req.user.id,
        address,
        totalAmount: parseFloat(totalAmount),
        status:      "CONFIRMED",
        paymentId:   razorpay_payment_id,
        paymentMode: "ONLINE",
        items: {
          create: cartItems.map(item => ({
            productId: item.productId,
            quantity:  item.quantity,
            price:     item.price,
          }))
        }
      },
      include: { items: true }
    });

    // Clear cart
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });

    res.json({ success: true, message: "Payment verified and order placed!", order });

  } catch (err) {
    console.error("Razorpay verify error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
