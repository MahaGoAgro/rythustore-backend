const express = require("express");
const router  = express.Router();

// Cache news for 2 hours
let newsCache = { data: null, fetchedAt: null };
const CACHE_TTL = 2 * 60 * 60 * 1000;

// ── Telugu Agriculture News RSS Sources ────────
// Focus on AP/Telangana farmers in Telugu language
const RSS_SOURCES = [
  {
    url:    "https://www.sakshi.com/rss/agriculture",
    source: "సాక్షి",
    lang:   "te"
  },
  {
    url:    "https://www.eenadu.net/rss/agriculture",
    source: "ఈనాడు",
    lang:   "te"
  },
  {
    url:    "https://telugu.oneindia.com/rss/agriculture.xml",
    source: "వన్‌ఇండియా తెలుగు",
    lang:   "te"
  },
  {
    url:    "https://www.tv5news.in/rss/agriculture",
    source: "TV5 న్యూస్",
    lang:   "te"
  },
];

// ── Parse RSS XML ──────────────────────────────
const parseRSS = (xml, sourceName) => {
  const items = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  itemMatches.slice(0, 4).forEach(item => {
    const title = (
      item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      item.match(/<title>(.*?)<\/title>/)
    )?.[1]?.trim();

    // Try multiple URL fields in priority order
    // guid is often the actual article URL in Telugu RSS feeds
    const guid = item.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1]?.trim();
    const linkRaw = item.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ||
                    item.match(/<link\s+href="([^"]+)"/)?.[1]?.trim();

    // Use guid if it looks like a full article URL, otherwise use link
    const link = (guid && guid.startsWith("http") && guid.length > 40)
      ? guid
      : (linkRaw && linkRaw.startsWith("http") && linkRaw.length > 40)
        ? linkRaw
        : null;

    const desc = (
      item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
      item.match(/<description>(.*?)<\/description>/)
    )?.[1]?.replace(/<[^>]+>/g, "")?.trim()?.slice(0, 150);

    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim();

    if (title && link) {
      items.push({
        title,
        description: desc || "",
        url:         link,
        source:      sourceName,
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

    // Fetch from Telugu RSS sources in parallel
    const results = await Promise.allSettled(
      RSS_SOURCES.map(async ({ url, source }) => {
        const controller = new AbortController();
        const timeout    = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(url, {
            signal:  controller.signal,
            headers: { "User-Agent": "RythuStore/1.0 (Telugu agriculture news)" }
          });
          const xml = await response.text();
          return parseRSS(xml, source);
        } finally {
          clearTimeout(timeout);
        }
      })
    );

    results.forEach(result => {
      if (result.status === "fulfilled") {
        articles.push(...result.value);
      }
    });

    // Sort newest first
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

// ── Telugu fallback news (shown if all RSS sources fail) ──
const getTeluguFallbackNews = () => [
  {
    title:       "ఖరీఫ్ పంటలకు కనీస మద్దతు ధర పెంపు — రైతులకు లాభం",
    description: "కేంద్ర ప్రభుత్వం ప్రధాన ఖరీఫ్ పంటలైన వరి, పత్తి, మొక్కజొన్నలకు కనీస మద్దతు ధరను పెంచింది.",
    url:         "https://www.sakshi.com/news/agriculture",
    source:      "సాక్షి",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "తెలంగాణలో కొత్త అధిక దిగుబడి పత్తి రకం విడుదల",
    description: "ICAR తెలంగాణ మరియు ఆంధ్రప్రదేశ్ నల్ల నేల ప్రాంతాలకు అనుకూలమైన కొత్త పత్తి రకాన్ని విడుదల చేసింది.",
    url:         "https://www.eenadu.net/telangana/district-news",
    source:      "ఈనాడు",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "కృష్ణా, గుంటూరు జిల్లాల్లో సేంద్రీయ వ్యవసాయం పెరుగుతోంది",
    description: "కృష్ణా మరియు గుంటూరు జిల్లాల రైతులు సేంద్రీయ వ్యవసాయ పద్ధతులను అవలంబిస్తున్నారు.",
    url:         "https://www.sakshi.com/news/andhra-pradesh",
    source:      "సాక్షి",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "రబీ సీజన్‌కు విత్తనాలు, ఎరువుల సరఫరా మెరుగుపడింది",
    description: "వచ్చే రబీ సీజన్‌కు అవసరమైన విత్తనాలు మరియు ఎరువుల సరఫరా చేయడానికి ప్రభుత్వం సిద్ధంగా ఉంది.",
    url:         "https://www.eenadu.net/andhra-pradesh",
    source:      "ఈనాడు",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
  {
    title:       "ఆంధ్రప్రదేశ్ రైతులకు పంట బీమా పరిహారం మంజూరు",
    description: "ప్రకృతి వైపరీత్యాల వల్ల పంట నష్టపోయిన రైతులకు పంట బీమా పరిహారం అందించడం ప్రారంభించింది.",
    url:         "https://www.tv5news.in/andhra-pradesh",
    source:      "TV5 న్యూస్",
    imageUrl:    null,
    publishedAt: new Date().toISOString(),
  },
];

module.exports = router;