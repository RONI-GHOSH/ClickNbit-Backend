const express = require("express");
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const twilio = require("twilio");
const { token } = require("morgan");
const admin = require("../config/firebaseAdmin");
const app = express();

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

app.use(express.json());

app.post("/phone", async (req, res) => {
  const { number, channel } = req.query;

  if (!number)
    return res.status(400).json({ error: "Phone number is required" });

  try {
    const response = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verifications.create({
        to: `+${number}`,
        channel: channel || "sms",
      });

    return res.json({
      message: "OTP sent successfully",
      status: response.status,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/verify", async (req, res) => {
  const { number, code } = req.query;

  if (!number || !code)
    return res.status(400).json({
      error: "Phone number and OTP code are required",
    });

  try {
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks.create({
        to: `+${number}`,
        code,
      });

    if (check.status === "approved") {

      let user = await pool.query(
        `SELECT user_id FROM users WHERE phone = $1`,
        [number]
      );

      let uid;

      if (user.rows.length === 0) {
        const result = await pool.query(
          `INSERT INTO users (phone) VALUES ($1) RETURNING user_id`,
          [number]
        );
        uid = result.rows[0].user_id;
      } else {
        uid = user.rows[0].user_id;
      }

      const token = jwt.sign(
        { id: uid },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.json({
        message: "OTP verified successfully",
        token,
        user_id: uid,
      });
    }

    return res.json({
      message: "Invalid or expired OTP",
      approved: false,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST verify firebase token
app.post("/firebase", async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: "ID token is required" });
  }

  try {
    // 1️⃣ Verify ID TOKEN using Firebase Admin
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    // User info from Google sign-in
    const email = decoded.email || null;
    const name = decoded.name || null;
    const picture = decoded.picture || null;

    // 2️⃣ Check if user exists in PostgreSQL
    const existing = await pool.query(
      `SELECT user_id, email FROM users WHERE firebase_uid = $1`,
      [uid]
    );

    let userId;

    // 3️⃣ If NEW USER → insert
    if (existing.rows.length === 0) {
      const insert = await pool.query(
        `INSERT INTO users (firebase_uid, email, name, profile_image_url)
         VALUES ($1, $2, $3, $4)
         RETURNING user_id`,
        [uid, email, name, picture]
      );

      userId = insert.rows[0].user_id;
    } else {
      // Existing user
      userId = existing.rows[0].user_id;
    }

    // 4️⃣ Generate JWT token
    const token = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "User authenticated successfully",
      token,
      user_id: userId
    });

  } catch (error) {
    console.error("Firebase verification error:", error);
    return res.status(401).json({ error: "Invalid or expired Firebase ID Token" });
  }
});


module.exports = app;
