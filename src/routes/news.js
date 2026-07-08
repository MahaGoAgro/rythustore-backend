const express = require("express");
const router  = express.Router();

// Cache news for 2 hours
let newsCache = { data: null, fetchedAt: null };
const CACHE_TTL = 2 * 60 * 60 * 1000;

// ── Google News RSS — Telugu Agriculture ───────
// Google News RSS always provides direct article URLs
// These search for Telugu agriculture news from AP/TS sources
const RSS_SOURCES = [
  {
    // Telugu agriculture news from AP/TS
    url: "https://news.google.com/rss/search?q=వ్యవసాయం+ఆంధ్రప్రదేశ్+తెలంగాణ&hl=te&gl=IN&ceid=IN:te",
    source: "Google వార్తలు"
  },
  {
    // Farmer news in Telugu
    url: "https://news.google.com/rss/search?q=రైతులు+పంటలు+విత్తనాలు&hl=te&gl=IN&ceid=IN:te",
    source: "Google వార్తలు"
  },
  {
    // MSP and crop prices in Telugu
    url: "https://news.google.com/rss/search?q=కనీస+మద్దతు+ధర+పంట+ధరలు+తెలుగు&hl=te&gl=IN&ceid=IN:te",
    source: "Google వార్తలు"
  },
];

// ── Parse RSS XML ──────────────────────────────
const parseRSS = (xml, sourceName) => {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  itemMatches.slice(0, 4).forEach(item => {
    // Title
    const title = (
      item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      item.match(/<title>(.*?)<\/title>/)
    )?.[1]?.trim()?.replace(/&amp;/g, "&")?.replace(/&lt;/g, "<")?.replace(/&gt;/g, ">");

    // Google News uses <link> right after </title> — not inside CDATA
    // Extract it carefully
    const linkMatch = item.match(/<link>(https?:\/\/[^<]+)<\/link>/);
    const guidMatch = item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/);
    const link = linkMatch?.[1]?.trim() || guidMatch?.[1]?.trim();

    // Source name from Google News RSS
    const sourceFromFeed = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1]?.trim()
                        || item.match(/<a:name>(.*?)<\/a:name>/)?.[1]?.trim()
                        || sourceName;

    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim();

    if (title && link && link.startsWith("http")) {
      items.push({
        title,
        description: "",
        url:         link,
        source:      sourceFromFeed,
        imageUrl:    null,
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

    // Fetch from Google News RSS in parallel
    const results = await Promise.allSettled(
      RSS_SOURCES.map(async ({ url, source }) => {
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(url, {
            signal:  controller.signal,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; RythuStore/1.0)",
              "Accept":     "application/rss+xml, application/xml, text/xml"
            }
          });
          const xml = await response.text();
          return parseRSS(xml, source);
        } finally {
          clearTimeout(timeout);
        }
      })
    );

    // Collect successful results, deduplicate by title
    const seen = new Set();
    results.forEach(result => {
      if (result.status === "fulfilled") {
        result.value.forEach(article => {
          if (!seen.has(article.title)) {
            seen.add(article.title);
            articles.push(article);
          }
        });
      }
    });

    // Sort newest first, take top 8
    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const top8 = articles.slice(0, 8);

    if (top8.length === 0) {
      return res.json({ success: true, articles: getTeluguFallbackNews() });
    }

    newsCache = { data: top8, fetchedAt: Date.now() };
    res.json({ success: true, articles: top8 });

  } catch (err) {
    console.error("News fetch error:", err.message);
    if (newsCache.data) {
      return res.json({ success: true, articles: newsCache.data, cached: true });
    }
    res.json({ success: true, articles: getTeluguFallbackNews() });
  }
});

// ── Telugu fallback news ───────────────────────
const getTeluguFallbackNews = () => [
  {
    title:       "ఖరీఫ్ పంటలకు కనీస మద్దతు ధర పెంపు — రైతులకు లాభం",
    description: "కేంద్ర ప్రభుత్వం ప్రధాన ఖరీఫ్ పంటలైన వరి, పత్తి, మొక్కజొన్నలకు కనీస మద్దతు ధరను పెంచింది.",
    url:         "https://www.sakshi.com/family/sagubadi",
    source:      "సాక్షి - సాగుబడి",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "తెలంగాణలో కొత్త అధిక దిగుబడి పత్తి రకం విడుదల",
    description: "ICAR తెలంగాణ మరియు ఆంధ్రప్రదేశ్ నల్ల నేల ప్రాంతాలకు అనుకూలమైన కొత్త పత్తి రకాన్ని విడుదల చేసింది.",
    url:         "https://www.eenadu.net/andhra-pradesh",
    source:      "ఈనాడు",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "రైతు భరోసా నిధులు ఖాతాల్లో జమ — ఆంధ్రప్రదేశ్ రైతులకు శుభవార్త",
    description: "ఆంధ్రప్రదేశ్ రైతు భరోసా పథకం కింద రైతుల ఖాతాల్లో నేరుగా నగదు జమ అయింది.",
    url:         "https://www.sakshi.com/tags/agriculture",
    source:      "సాక్షి",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "కృష్ణా, గుంటూరు జిల్లాల్లో సేంద్రీయ వ్యవసాయం పెరుగుతోంది",
    description: "కృష్ణా మరియు గుంటూరు జిల్లాల రైతులు సేంద్రీయ వ్యవసాయ పద్ధతులను అవలంబిస్తున్నారు.",
    url:         "https://news.google.com/search?q=వ్యవసాయం+ఆంధ్రప్రదేశ్&hl=te",
    source:      "Google వార్తలు",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "రబీ సీజన్‌కు విత్తనాలు, ఎరువుల సరఫరా మెరుగుపడింది",
    description: "వచ్చే రబీ సీజన్‌కు అవసరమైన విత్తనాలు మరియు ఎరువుల సరఫరా చేయడానికి ప్రభుత్వం సిద్ధంగా ఉంది.",
    url:         "https://news.google.com/search?q=రైతులు+పంటలు&hl=te",
    source:      "Google వార్తలు",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
];

module.exports = router;