const express    = require("express");
const cloudinary = require("cloudinary").v2;
const { protect } = require("../middleware/auth");

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── POST /api/upload ───────────────────────────
// Receives a base64 image from admin panel,
// uploads to Cloudinary, returns the CDN URL.
// Only the stored URL goes in the database — not the image itself.
router.post("/", protect, async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, message: "No image provided!" });
    }

    // Validate it's a base64 image string
    if (!image.startsWith("data:image/")) {
      return res.status(400).json({ success: false, message: "Invalid image format!" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(image, {
      folder:         "rythustore/products",
      transformation: [
        { width: 800, height: 800, crop: "limit" }, // max 800x800
        { quality: "auto" },                         // auto-compress
        { fetch_format: "auto" },                    // serve webp to modern browsers
      ],
    });

    res.json({
      success:  true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
    });

  } catch (err) {
    console.error("Cloudinary upload error:", err.message);
    res.status(500).json({ success: false, message: "Image upload failed!" });
  }
});

// ── DELETE /api/upload ─────────────────────────
// Deletes an image from Cloudinary when a product is deleted
router.delete("/", protect, async (req, res) => {
  try {
    const { publicId } = req.body;
    if (!publicId) return res.json({ success: true }); // nothing to delete

    await cloudinary.uploader.destroy(publicId);
    res.json({ success: true });

  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
    res.status(500).json({ success: false, message: "Could not delete image." });
  }
});

module.exports = router;
