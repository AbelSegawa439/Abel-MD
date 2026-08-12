require('dotenv').config();

module.exports = {
  // =============================
  // OWNER & CORE
  // =============================
  OWNER_NUMBER: process.env.OWNER_NUMBER || "256747287538",
  OWNER_NAME: process.env.OWNER_NAME || "Abel",
  BOT_NAME: process.env.BOT_NAME || "Abel-MD",
  PREFIX: process.env.PREFIX || ".",

  // =============================
  // BRANDING
  // =============================
  CAPTION: process.env.CAPTION || "© Abel-MD • Powered by AbelSegawa439",
  STATUS_MSG: process.env.STATUS_MSG || "Abel-MD is online ✨",
  MENU_IMG: process.env.MENU_IMG || "https://i.imgur.com/8Km9tLL.png",

  // =============================
  // PAIRING / SITE
  // =============================
  SITE_URL: process.env.SITE_URL || "https://abelmd.vercel.app",
  PORT: process.env.PORT || 3000,

  // =============================
  // DATABASE (optional)
  // =============================
  DATABASE_URL: process.env.DATABASE_URL || "",

  // =============================
  // SESSION
  // =============================
  SESSION_DIR: "./session"
};