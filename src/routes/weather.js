const express = require("express");
const axios = require("axios");

const router = express.Router();

// ── GET /api/weather?lat=30.9&lon=75.8 ─────────────────────────
// ── GET /api/weather?city=Ludhiana ─────────────────────────────
router.get("/", async (req, res) => {
  const { lat, lon, city } = req.query;

  if (!process.env.WEATHER_API_KEY) {
    return res.status(503).json({
      success: false,
      message: "Weather API not configured yet."
    });
  }

  if (!lat && !lon && !city) {
    return res.status(400).json({
      success: false,
      message: "Please provide either lat/lon or city."
    });
  }

  try {
    const params = {
      appid: process.env.WEATHER_API_KEY,
      units: "metric",
      cnt:   8,
    };

    if (lat && lon) {
      params.lat = lat;
      params.lon = lon;
    } else {
      params.q = city;
    }

    const { data } = await axios.get(`${process.env.WEATHER_BASE_URL}/forecast`, { params });

    const current = data.list[0];

    const dailyMap = {};
    data.list.forEach((item) => {
      const date = item.dt_txt.split(" ")[0];
      const hour = item.dt_txt.split(" ")[1];
      if (!dailyMap[date] || hour === "12:00:00") {
        dailyMap[date] = item;
      }
    });

    res.json({
      success: true,
      city: data.city.name,
      temp:      Math.round(current.main.temp),
      feels:     Math.round(current.main.feels_like),
      humidity:  current.main.humidity,
      wind:      Math.round(current.wind.speed * 3.6),
      condition: current.weather[0].main,
      description: current.weather[0].description,
      icon:      current.weather[0].icon,
      willRainSoon: data.list.slice(0, 4).some(
        (item) => item.weather[0].main === "Rain" || item.weather[0].main === "Thunderstorm"
      ),
      forecast: Object.values(dailyMap).slice(0, 5).map((item) => ({
        date:      item.dt_txt.split(" ")[0],
        temp:      Math.round(item.main.temp),
        condition: item.weather[0].main,
        icon:      item.weather[0].icon,
      })),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Could not fetch weather data",
      error: err.response?.data?.message || err.message,
    });
  }
});

module.exports = router;
