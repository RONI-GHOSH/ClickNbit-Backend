const express = require("express");
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const twilio = require("twilio");
const { token } = require("morgan");
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


module.exports = app;
