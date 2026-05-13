const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Horoskopi VIP Astrology API po punon 😄"
  });
});

app.get("/calculate-chart", (req, res) => {
  res.json({
    success: true,
    message: "Swiss Ephemeris engine do lidhet këtu."
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
