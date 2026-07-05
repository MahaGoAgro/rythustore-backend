const express = require("express");
const prisma  = require("../config/db");
const { protect } = require("../middleware/auth");
const log     = require("../utils/logger");

const router = express.Router();

// ── GET /api/reviews/:productId ────────────────
// Paginated reviews — ?page=1&limit=10
router.get("/:productId", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const skip  = (page - 1) * limit;

    const [reviews, total, breakdown] = await Promise.all([
      prisma.review.findMany({
        where:   { productId: req.params.productId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.review.count({ where: { productId: req.params.productId } }),
      prisma.review.groupBy({
        by:    ["rating"],
        where: { productId: req.params.productId },
        _count: { rating: true },
      }),
    ]);

    // Build breakdown object { 1: count, 2: count, ... }
    const breakdownMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdown.forEach(b => { breakdownMap[b.rating] = b._count.rating; });

    // Calculate average
    const allRatings = await prisma.review.findMany({
      where:  { productId: req.params.productId },
      select: { rating: true },
    });
    const avgRating = allRatings.length
      ? allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
      : 0;

    res.json({
      success:    true,
      count:      total,
      avgRating:  Math.round(avgRating * 10) / 10,
      breakdown:  breakdownMap,
      reviews,
      page,
      pages:   Math.ceil(total / limit),
      hasMore: page * limit < total,
    });
  } catch (err) {
    log.error("REVIEWS_GET_ERROR", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/reviews/:productId ───────────────
router.post("/:productId", protect, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.productId;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5!" });
    }
    if (!comment || comment.trim().length < 10) {
      return res.status(400).json({ success: false, message: "Please write at least 10 characters!" });
    }
    if (comment.trim().length > 1000) {
      return res.status(400).json({ success: false, message: "Review must be under 1000 characters!" });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ success: false, message: "Product not found!" });

    const existing = await prisma.review.findUnique({
      where: { productId_userId: { productId, userId: req.user.id } }
    });

    let review;
    if (existing) {
      review = await prisma.review.update({
        where:   { productId_userId: { productId, userId: req.user.id } },
        data:    { rating: parseInt(rating), comment: comment.trim() },
        include: { user: { select: { id: true, name: true } } },
      });
    } else {
      review = await prisma.review.create({
        data:    { productId, userId: req.user.id, rating: parseInt(rating), comment: comment.trim() },
        include: { user: { select: { id: true, name: true } } },
      });
    }

    // Recalculate product rating from all reviews
    const allReviews = await prisma.review.findMany({
      where:  { productId },
      select: { rating: true },
    });
    const newAvg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await prisma.product.update({
      where: { id: productId },
      data:  { rating: Math.round(newAvg * 10) / 10, reviews: allReviews.length },
    });

    log.info("REVIEW_SUBMITTED", { productId, userId: req.user.id, rating });

    res.json({ success: true, message: existing ? "Review updated!" : "Review submitted!", review });
  } catch (err) {
    log.error("REVIEW_SUBMIT_ERROR", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/reviews/:productId ─────────────
router.delete("/:productId", protect, async (req, res) => {
  try {
    const existing = await prisma.review.findUnique({
      where: { productId_userId: { productId: req.params.productId, userId: req.user.id } }
    });
    if (!existing) return res.status(404).json({ success: false, message: "Review not found!" });

    await prisma.review.delete({
      where: { productId_userId: { productId: req.params.productId, userId: req.user.id } }
    });

    // Recalculate
    const allReviews = await prisma.review.findMany({
      where:  { productId: req.params.productId },
      select: { rating: true },
    });
    const newAvg = allReviews.length
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0;

    await prisma.product.update({
      where: { id: req.params.productId },
      data:  { rating: Math.round(newAvg * 10) / 10, reviews: allReviews.length },
    });

    res.json({ success: true, message: "Review deleted!" });
  } catch (err) {
    log.error("REVIEW_DELETE_ERROR", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
