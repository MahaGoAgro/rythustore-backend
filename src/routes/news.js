const express = require("express");
const router  = express.Router();

// Cache news for 1 hour to avoid hitting API limits
let newsCache = {
  data:      null,
  fetchedAt: null,
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// ── GET /api/news ──────────────────────────────
// Returns latest agriculture news for India
// Cached for 1 hour to conserve free tier API calls
router.get("/", async (req, res) => {
  try {
    // Return cached data if fresh
    if (newsCache.data && Date.now() - newsCache.fetchedAt < CACHE_DURATION) {
      return res.json({ success: true, articles: newsCache.data, cached: true });
    }

    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "News API key not configured"
      });
    }

    // Fetch agriculture news for India
    const url = `https://newsapi.org/v2/everything?` +
      `q=agriculture+India+farming+crops+farmers&` +
      `language=en&` +
      `sortBy=publishedAt&` +
      `pageSize=8&` +
      `apiKey=${apiKey}`;

    const response = await fetch(url);
    const data     = await response.json();

    if (data.status !== "ok") {
      throw new Error(data.message || "NewsAPI error");
    }

    // Filter and clean articles
    const articles = data.articles
      .filter(a => a.title && a.url && !a.title.includes("[Removed]"))
      .slice(0, 6)
      .map(a => ({
        title:       a.title,
        description: a.description || "",
        url:         a.url,
        source:      a.source?.name || "News",
        publishedAt: a.publishedAt,
        imageUrl:    a.urlToImage || null,
      }));

    // Update cache
    newsCache = { data: articles, fetchedAt: Date.now() };

    res.json({ success: true, articles });

  } catch (err) {
    console.error("News fetch error:", err.message);

    // Return cached data even if stale, rather than failing
    if (newsCache.data) {
      return res.json({ success: true, articles: newsCache.data, cached: true });
    }

    res.status(500).json({ success: false, message: "Could not fetch news" });
  }
});

module.exports = router;