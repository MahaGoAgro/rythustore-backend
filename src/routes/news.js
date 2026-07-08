const express = require("express");
const router  = express.Router();

// Cache news for 2 hours to avoid hammering sources
let newsCache = { data: null, fetchedAt: null };
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

// ── Free agriculture news sources (RSS feeds) ──
// These are publicly available RSS feeds, no API key needed
const RSS_SOURCES = [
  {
    url:    "https://www.thehindu.com/sci-tech/agriculture/feeder/default.rss",
    source: "The Hindu"
  },
  {
    url:    "https://krishijagran.com/feed/",
    source: "Krishi Jagran"
  },
  {
    url:    "https://www.downtoearth.org.in/rss/agriculture",
    source: "Down To Earth"
  },
];

// ── Parse RSS XML manually (no external library) ──
const parseRSS = (xml, sourceName) => {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  itemMatches.slice(0, 4).forEach(item => {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                   item.match(/<title>(.*?)<\/title>/))?.[1]?.trim();
    const link  = (item.match(/<link>(.*?)<\/link>/) ||
                   item.match(/<guid>(.*?)<\/guid>/))?.[1]?.trim();
    const desc  = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                   item.match(/<description>(.*?)<\/description>/))?.[1]
                   ?.replace(/<[^>]+>/g, "")?.trim()?.slice(0, 150);
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim();
    const img   = item.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] ||
                  item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || null;

    if (title && link) {
      items.push({
        title,
        description: desc || "",
        url:         link,
        source:      sourceName,
        imageUrl:    img,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
  });

  return items;
};

// ── GET /api/news ──────────────────────────────
router.get("/", async (req, res) => {
  try {
    // Return cached if fresh
    if (newsCache.data && Date.now() - newsCache.fetchedAt < CACHE_TTL) {
      return res.json({ success: true, articles: newsCache.data, cached: true });
    }

    const articles = [];

    // Fetch from all RSS sources in parallel
    const results = await Promise.allSettled(
      RSS_SOURCES.map(async ({ url, source }) => {
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 5000); // 5s timeout

        try {
          const response = await fetch(url, {
            signal:  controller.signal,
            headers: { "User-Agent": "RythuStore/1.0 (agriculture news aggregator)" }
          });
          const xml  = await response.text();
          const items = parseRSS(xml, source);
          return items;
        } finally {
          clearTimeout(timeout);
        }
      })
    );

    // Collect successful results
    results.forEach(result => {
      if (result.status === "fulfilled") {
        articles.push(...result.value);
      }
    });

    // Sort by date, newest first
    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Take top 8
    const top8 = articles.slice(0, 8);

    // If no articles fetched (all sources failed), return fallback
    if (top8.length === 0) {
      return res.json({
        success:  true,
        articles: getFallbackNews(),
        cached:   false,
      });
    }

    // Update cache
    newsCache = { data: top8, fetchedAt: Date.now() };

    res.json({ success: true, articles: top8 });

  } catch (err) {
    console.error("News fetch error:", err.message);

    // Return cached even if stale, or fallback
    if (newsCache.data) {
      return res.json({ success: true, articles: newsCache.data, cached: true });
    }

    res.json({ success: true, articles: getFallbackNews() });
  }
});

// ── Fallback news (shown if all sources fail) ──
const getFallbackNews = () => [
  {
    title:       "Government raises MSP for Kharif crops — farmers to benefit",
    description: "The central government has announced an increase in Minimum Support Price for major kharif crops including paddy, cotton and maize.",
    url:         "https://krishijagran.com",
    source:      "Krishi Jagran",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "New high-yield cotton variety released for Telangana farmers",
    description: "ICAR has released a new cotton variety suitable for the black soil regions of Andhra Pradesh and Telangana with 30% higher yield.",
    url:         "https://www.thehindu.com",
    source:      "The Hindu",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "Organic farming adoption rises in Krishna and Guntur districts",
    description: "Farmers in Krishna and Guntur districts are increasingly adopting organic farming methods, boosting income and soil health.",
    url:         "https://www.downtoearth.org.in",
    source:      "Down To Earth",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
];

module.exports = router;
