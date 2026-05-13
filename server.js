const express = require("express");
const cors = require("cors");
const swe = require("swisseph");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Horoskopi VIP Astrology API po punon 😄"
  });
});

app.post("/calculate-chart", async (req, res) => {
  try {
    const { date, time, city } = req.body;

    if (!date || !time || !city) {
      return res.status(400).json({
        success: false,
        error: "Mungon data, ora ose qyteti."
      });
    }

    const geo = await getCoordinates(city);

    if (!geo) {
      return res.status(404).json({
        success: false,
        error: "Qyteti nuk u gjet."
      });
    }

    const timezone = getSimpleTimezone(date);
    const utc = localToUTC(date, time, timezone);

    const jd = swe.swe_julday(
      utc.year,
      utc.month,
      utc.day,
      utc.hourDecimal,
      swe.SE_GREG_CAL
    );

    const planets = await calculatePlanets(jd);
    const houses = await calculateHouses(jd, geo.lat, geo.lon);

    res.json({
      success: true,
      system: "Western / Tropical",
      source: "Swiss Ephemeris / Moshier",
      input: {
        date,
        time,
        city
      },
      location: {
        name: geo.name,
        latitude: geo.lat,
        longitude: geo.lon,
        timezone
      },
      chart: {
        ascendant: houses.ascendant,
        midheaven: houses.midheaven,
        houses: houses.houses,
        planets
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: String(error)
    });
  }
});

async function getCoordinates(city) {
  const url =
    "https://nominatim.openstreetmap.org/search?q=" +
    encodeURIComponent(city) +
    "&format=json&limit=1";

  const response = await fetch(url, {
    headers: {
      "User-Agent": "HoroskopiVIP/1.0"
    }
  });

  const data = await response.json();

  if (!data || !data[0]) return null;

  return {
    name: data[0].display_name,
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon)
  };
}

function getSimpleTimezone(date) {
  const month = parseInt(date.split("-")[1], 10);

  if (month >= 3 && month <= 10) {
    return "+02:00";
  }

  return "+01:00";
}

function localToUTC(date, time, timezone) {
  const iso = `${date}T${time}:00${timezone}`;
  const d = new Date(iso);

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hourDecimal:
      d.getUTCHours() +
      d.getUTCMinutes() / 60 +
      d.getUTCSeconds() / 3600
  };
}

async function calculatePlanets(jd) {
  const bodies = [
    { id: swe.SE_SUN, name: "Sun", name_sq: "Dielli" },
    { id: swe.SE_MOON, name: "Moon", name_sq: "Hëna" },
    { id: swe.SE_MERCURY, name: "Mercury", name_sq: "Merkuri" },
    { id: swe.SE_VENUS, name: "Venus", name_sq: "Venusi" },
    { id: swe.SE_MARS, name: "Mars", name_sq: "Marsi" },
    { id: swe.SE_JUPITER, name: "Jupiter", name_sq: "Jupiteri" },
    { id: swe.SE_SATURN, name: "Saturn", name_sq: "Saturni" },
    { id: swe.SE_TRUE_NODE, name: "North Node", name_sq: "Nyja Veriore" }
  ];

  const results = [];

  for (const body of bodies) {
    const result = await sweCalc(jd, body.id);

    const longitude = normalizeDegree(result.longitude);
    const signData = zodiacFromLongitude(longitude);

    results.push({
      id: body.id,
      name: body.name,
      name_sq: body.name_sq,
      longitude: Number(longitude.toFixed(4)),
      sign: signData.sign,
      sign_sq: signData.sign_sq,
      degree: signData.degree,
      fullDegree: signData.fullDegree,
      retrograde: result.longitudeSpeed < 0
    });
  }

  return results;
}

function sweCalc(jd, planetId) {
  return new Promise((resolve, reject) => {
    swe.swe_calc_ut(
      jd,
      planetId,
      swe.SEFLG_MOSEPH | swe.SEFLG_SPEED,
      function (result) {
        if (!result || result.error) {
          reject(result && result.error ? result.error : "Gabim në llogaritjen e planetit.");
        } else {
          resolve(result);
        }
      }
    );
  });
}

function calculateHouses(jd, lat, lon) {
  return new Promise((resolve, reject) => {
    swe.swe_houses(jd, lat, lon, "P", function (result) {
      if (!result || result.error) {
        reject(result && result.error ? result.error : "Gabim në llogaritjen e shtëpive.");
        return;
      }

      const ascLon =
        typeof result.ascendant !== "undefined"
          ? result.ascendant
          : result.ascmc && result.ascmc[0]
            ? result.ascmc[0]
            : null;

      const mcLon =
        typeof result.mc !== "undefined"
          ? result.mc
          : result.ascmc && result.ascmc[1]
            ? result.ascmc[1]
            : null;

      const housesRaw = result.house || result.houses || [];

      resolve({
        ascendant: ascLon !== null ? formatPoint("Ascendant", "Ashendenti", ascLon) : null,
        midheaven: mcLon !== null ? formatPoint("Midheaven", "Midheaven", mcLon) : null,
        houses: housesRaw.map((h, index) =>
          formatPoint("House " + (index + 1), "Shtëpia " + (index + 1), h)
        )
      });
    });
  });
}

function formatPoint(name, name_sq, longitude) {
  const lon = normalizeDegree(longitude);
  const signData = zodiacFromLongitude(lon);

  return {
    name,
    name_sq,
    longitude: Number(lon.toFixed(4)),
    sign: signData.sign,
    sign_sq: signData.sign_sq,
    degree: signData.degree,
    fullDegree: signData.fullDegree
  };
}

function normalizeDegree(deg) {
  let d = Number(deg) % 360;
  if (d < 0) d += 360;
  return d;
}

function zodiacFromLongitude(longitude) {
  const signsEn = [
    "Aries", "Taurus", "Gemini", "Cancer",
    "Leo", "Virgo", "Libra", "Scorpio",
    "Sagittarius", "Capricorn", "Aquarius", "Pisces"
  ];

  const signsSq = [
    "Dashi", "Demi", "Binjakët", "Gaforrja",
    "Luani", "Virgjëresha", "Peshorja", "Akrepi",
    "Shigjetari", "Bricjapi", "Ujori", "Peshqit"
  ];

  const index = Math.floor(longitude / 30);
  const degree = longitude % 30;

  return {
    sign: signsEn[index],
    sign_sq: signsSq[index],
    degree: Math.floor(degree),
    fullDegree: degree.toFixed(2)
  };
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
