const express = require("express");
const {
  refreshEngagement,
  buildRecentFeed,
  buildRelevantFeed,
} = require("./feed-generators");

const router = express.Router();

// ---- Simple cron auth helper ----
function verifyCronSecret(req) {
  return req.headers["x-cron-secret"] === process.env.CRON_SECRET;
}

/**
 * Refresh engagement materialized view
 * Suggested: every 30 minutes
 */
router.post("/internal/refresh-engagement", async (req, res) => {
  try {
    if (!verifyCronSecret(req)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await refreshEngagement();

    res.status(200).json({
      success: true,
      message: "Engagement refreshed",
    });
  } catch (error) {
    console.error("refreshEngagement error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Build recent feed
 * Suggested: every 2 hours
 */
router.post("/internal/build-recent-feed", async (req, res) => {
  try {
    if (!verifyCronSecret(req)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await buildRecentFeed();

    res.status(200).json({
      success: true,
      message: "Recent feed built",
    });
  } catch (error) {
    console.error("buildRecentFeed error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Build relevant feed
 * Suggested: every 6 hours
 */
router.post("/internal/build-relevant-feed", async (req, res) => {
  try {
    if (!verifyCronSecret(req)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    await buildRelevantFeed();

    res.status(200).json({
      success: true,
      message: "Relevant feed built",
    });
  } catch (error) {
    console.error("buildRelevantFeed error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
