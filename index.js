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

// ==== SCHEMAS ====
const deviceSchema = new mongoose.Schema({
  device_name: String,
  temperature: Number,
  humidity: Number,
  set_temperature: Number,
  set_humidity: Number,
  ac_fan_status: Number,
  dc_fan_status: Number,
  circular_fan_speed: Number,
  operation_mode: String,
  device_status: String,
  timestamp: { type: Date, default: Date.now },
});

// Schema for threshold settings
const thresholdSchema = new mongoose.Schema({
  device_name: { type: String, required: true, unique: true },
  temperature: { type: Number, default: 25.0 }, // Changed to match IoT device expectation
  humidity: { type: Number, default: 50.0 }, // Changed to match IoT device expectation
  last_updated: { type: Date, default: Date.now },
});

const DeviceData = mongoose.model("DeviceData", deviceSchema);
const Threshold = mongoose.model("Threshold", thresholdSchema);

// ==== ROUTES ====

// Test route
app.get("/", (req, res) => {
  res.send("IoT Server is running 🚀");
});

// IoT device posts sensor data here
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

// Get latest sensor data
app.get("/iotdata/latest", async (req, res) => {
  try {
    const latest = await DeviceData.findOne().sort({ timestamp: -1 });
    res.json(latest);
  } catch (err) {
    res.status(500).send("Error fetching latest data");
  }
});

// Get all 3 recent sensor readings
app.get("/iotdata/recent", async (req, res) => {
  try {
    const recent = await DeviceData.find().sort({ timestamp: -1 }).limit(3);
    res.json(recent);
  } catch (err) {
    res.status(500).send("Error fetching recent data");
  }
});

// ==== THRESHOLD ENDPOINTS ====

// Endpoint for APPLICATION to POST/SET thresholds
app.post("/api/thresholds", async (req, res) => {
  try {
    const { device_name, temperature, humidity } = req.body;

    if (!device_name) {
      return res.status(400).json({ error: "Device name is required" });
    }

    // Update or create threshold settings
    const threshold = await Threshold.findOneAndUpdate(
      { device_name: device_name },
      {
        temperature: temperature || 25.0,
        humidity: humidity || 50.0,
        last_updated: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`📝 Updated thresholds for device: ${device_name}`, {
      temperature: threshold.temperature,
      humidity: threshold.humidity,
    });

    res.json({
      message: "Threshold updated successfully",
      threshold: {
        device_name: threshold.device_name,
        temperature: threshold.temperature,
        humidity: threshold.humidity,
        last_updated: threshold.last_updated,
      },
    });
  } catch (err) {
    console.error("❌ Error updating threshold:", err);
    res.status(500).json({ error: "Error updating threshold" });
  }
});

// Endpoint for IOT DEVICE to GET/FETCH thresholds (used in thresholdServerURL)
app.get("/api/latest_threshold", async (req, res) => {
  try {
    const deviceName = req.query.device_name || "KVB";

    // Find threshold settings for this device
    let threshold = await Threshold.findOne({ device_name: deviceName });

    // If no threshold exists for this device, create default one
    if (!threshold) {
      threshold = new Threshold({
        device_name: deviceName,
        temperature: 25.0,
        humidity: 50.0,
      });
      await threshold.save();
      console.log(`📝 Created default threshold for device: ${deviceName}`);
    }

    // Return data in the format expected by the IoT device
    res.json({
      device_name: threshold.device_name,
      temperature: threshold.temperature,
      humidity: threshold.humidity,
    });

    console.log(`📤 Sent thresholds to device: ${deviceName}`, {
      temperature: threshold.temperature,
      humidity: threshold.humidity,
    });
  } catch (err) {
    console.error("❌ Error fetching threshold:", err);
    res.status(500).json({ error: "Error fetching threshold" });
  }
});

// Endpoint to get all threshold settings
app.get("/api/thresholds", async (req, res) => {
  try {
    const thresholds = await Threshold.find().sort({ device_name: 1 });
    res.json(thresholds);
  } catch (err) {
    console.error("❌ Error fetching thresholds:", err);
    res.status(500).json({ error: "Error fetching thresholds" });
  }
});

// ==== START SERVER ====
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
