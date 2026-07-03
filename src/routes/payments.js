const express  = require("express");
const Razorpay = require("razorpay");
const crypto   = require("crypto");
const prisma   = require("../config/db");
const { protect } = require("../middleware/auth");
const log      = require("../utils/logger");

const router = express.Router();

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys not configured!");
  }
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
};

router.post("/create-order", protect, async (req, res) => {
  try {
    const razorpay = getRazorpay();
    const { amount, currency = "INR" } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Valid amount is required!" });

    const razorpayOrder = await razorpay.orders.create({ amount: Math.round(amount * 100), currency, receipt: `receipt_${Date.now()}` });

    log.payment("PAYMENT_ORDER_CREATED", { userId: req.user.id, amount, razorpayOrderId: razorpayOrder.id });

    res.json({ success: true, orderId: razorpayOrder.id, amount: razorpayOrder.amount, currency: razorpayOrder.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    log.error("PAYMENT_CREATE_ERROR", err);
    res.status(500).json({ success: false, message: "Could not create payment order!" });
  }
});

router.post("/verify", protect, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, address, cartItems, totalAmount } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification data missing!" });
    }

    const body     = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");

    if (expected !== razorpay_signature) {
      log.security("PAYMENT_SIGNATURE_MISMATCH", { userId: req.user.id, razorpay_order_id });
      return res.status(400).json({ success: false, message: "Payment verification failed!" });
    }

    const order = await prisma.order.create({
      data: {
        userId: req.user.id, address, totalAmount: parseFloat(totalAmount),
        status: "CONFIRMED", paymentId: razorpay_payment_id, paymentMode: "ONLINE",
        items: { create: cartItems.map(item => ({ productId: item.productId, quantity: item.quantity, price: item.price })) }
      },
      include: { items: true }
    });

    await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });

    log.payment("PAYMENT_VERIFIED", { userId: req.user.id, paymentId: razorpay_payment_id, amount: totalAmount, orderId: order.id });

    res.json({ success: true, message: "Payment verified and order placed!", order });
  } catch (err) {
    log.error("PAYMENT_VERIFY_ERROR", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
