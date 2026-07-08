const express = require("express");
const prisma  = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// ── GET /api/testimonials ──────────────────────
// Returns mix of admin-added testimonials + 5-star reviews
router.get("/", async (req, res) => {
  try {
    // Get admin-added testimonials
    const adminTestimonials = await prisma.testimonial.findMany({
      where:   { isActive: true },
      orderBy: { createdAt: "desc" },
      take:    6,
    });

    // Auto-pull 5-star reviews as testimonials
    const starReviews = await prisma.review.findMany({
      where:   { rating: 5 },
      include: {
        user:    { select: { name: true } },
        product: { select: { name: true, category: true } },
      },
      orderBy: { createdAt: "desc" },
      take:    6,
    });

    // Convert reviews to testimonial format
    const reviewTestimonials = starReviews.map(r => ({
      id:       r.id,
      name:     r.user?.name || "Farmer",
      location: "Andhra Pradesh",
      message:  r.comment,
      rating:   r.rating,
      crop:     r.product?.name || null,
      imageUrl: null,
      isReview: true, // flag to show "Verified Purchase" badge
    }));

    // Combine — admin testimonials first, then reviews
    const combined = [...adminTestimonials, ...reviewTestimonials].slice(0, 8);

    res.json({ success: true, testimonials: combined });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/testimonials ─────────────────────
// Admin only — add a farmer success story
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const { name, location, message, rating, crop, imageUrl } = req.body;

    if (!name || !message) {
      return res.status(400).json({
        success: false,
        message: "Name and message are required!"
      });
    }

    const testimonial = await prisma.testimonial.create({
      data: {
        name,
        location: location || "Andhra Pradesh",
        message,
        rating:   rating ? parseInt(rating) : 5,
        crop:     crop    || null,
        imageUrl: imageUrl || null,
      }
    });

    res.status(201).json({ success: true, testimonial });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/testimonials/:id ──────────────────
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { name, location, message, rating, crop, imageUrl, isActive } = req.body;

    const testimonial = await prisma.testimonial.update({
      where: { id: req.params.id },
      data:  { name, location, message, rating: rating ? parseInt(rating) : undefined, crop, imageUrl, isActive },
    });

    res.json({ success: true, testimonial });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/testimonials/:id ───────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    await prisma.testimonial.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Testimonial deleted!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
