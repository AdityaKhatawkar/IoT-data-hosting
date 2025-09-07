const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();


// ==== CONFIG ====
const app = express();
const PORT = process.env.PORT || 8000;

// Use environment variable instead of hardcoding Mongo URI
const MONGO_URI = process.env.MONGO_URI;

// ==== MIDDLEWARE ====
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ==== MONGOOSE CONNECTION ====
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => {
  console.log("✅ Connected to MongoDB");
});

// ==== SCHEMA ====
const deviceSchema = new mongoose.Schema({
  device_name: String,
  temperature: Number,
  humidity: Number,
  set_temperature: Number,
  set_humidity: Number,
  heater_status: Number,
  exhaust_status: Number,
  aux_status: Number,
  operation_mode: String,
  timestamp: { type: Date, default: Date.now },
});

const DeviceData = mongoose.model("DeviceData", deviceSchema);

// ==== ROUTES ====

// Test route
app.get("/", (req, res) => {
  res.send("IoT Server is running 🚀");
});

// IoT device posts data here
app.post("/iotdata", async (req, res) => {
  try {
    const newData = new DeviceData(req.body);
    await newData.save();

    console.log("📥 Data received:", req.body);

    // Keep only the 3 latest readings
    const readings = await DeviceData.find().sort({ timestamp: -1 }).skip(3);
    if (readings.length > 0) {
      const idsToDelete = readings.map((r) => r._id);
      await DeviceData.deleteMany({ _id: { $in: idsToDelete } });
      console.log(`🗑️ Deleted ${idsToDelete.length} old readings`);
    }

    res.status(201).send("Data stored successfully");
  } catch (err) {
    console.error("❌ Error saving data:", err);
    res.status(500).send("Error saving data");
  }
});

// Get latest data
app.get("/iotdata/latest", async (req, res) => {
  try {
    const latest = await DeviceData.findOne().sort({ timestamp: -1 });
    res.json(latest);
  } catch (err) {
    res.status(500).send("Error fetching latest data");
  }
});

// Get all 3 recent readings
app.get("/iotdata/recent", async (req, res) => {
  try {
    const recent = await DeviceData.find().sort({ timestamp: -1 }).limit(3);
    res.json(recent);
  } catch (err) {
    res.status(500).send("Error fetching recent data");
  }
});

// ==== START SERVER ====
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
