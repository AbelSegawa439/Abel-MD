require("dotenv").config();

module.exports = {

  // =====================================================
  // OWNER & CORE
  // =====================================================

  OWNER_NUMBER:
    process.env.OWNER_NUMBER ||
    "256747287538",

  OWNER_NAME:
    process.env.OWNER_NAME ||
    "Abel",

  BOT_NAME:
    process.env.BOT_NAME ||
    "Abel-MD",

  PREFIX:
    process.env.PREFIX ||
    ".",


  // =====================================================
  // COUNTRY
  // =====================================================

  COUNTRY_CODE:
    process.env.COUNTRY_CODE ||
    "256",


  // =====================================================
  // BRANDING
  // =====================================================

  CAPTION:
    process.env.CAPTION ||
    "© Abel-MD • Powered by AbelSegawa439",

  STATUS_MSG:
    process.env.STATUS_MSG ||
    "Abel-MD is online ✨",

  MENU_IMG:
    process.env.MENU_IMG ||
    "https://i.imgur.com/8Km9tLL.png",


  // =====================================================
  // WEBSITE / RAILWAY
  // =====================================================

  SITE_URL:
    process.env.SITE_URL ||
    "https://abel-md-production.up.railway.app",

  PAIR_URL:
    process.env.PAIR_URL ||
    "https://abel-md-production.up.railway.app/pair",

  PORT:
    Number(
      process.env.PORT ||
      3000
    ),


  // =====================================================
  // DATABASE
  // =====================================================

  DATABASE_URL:
    process.env.DATABASE_URL ||
    "",


  // =====================================================
  // WHATSAPP SESSION
  // =====================================================

  SESSION_DIR:
    process.env.SESSION_DIR ||
    "./session",


  // =====================================================
  // RECONNECTION
  // =====================================================

  RECONNECT_DELAY:
    Number(
      process.env.RECONNECT_DELAY ||
      5000
    ),

  MAX_RECONNECT_ATTEMPTS:
    Number(
      process.env.MAX_RECONNECT_ATTEMPTS ||
      10
    ),


  // =====================================================
  // PAIRING
  // =====================================================

  PAIRING_COOLDOWN:
    Number(
      process.env.PAIRING_COOLDOWN ||
      10000
    ),

  PAIRING_CODE_EXPIRY:
    Number(
      process.env.PAIRING_CODE_EXPIRY ||
      60000
    ),


  // =====================================================
  // BOT FEATURES
  // =====================================================

  FEATURES: {

    AUTO_READ:
      process.env.AUTO_READ !== "false",

    AUTO_TYPING:
      process.env.AUTO_TYPING !== "false",

    AUTO_RECORDING:
      process.env.AUTO_RECORDING === "true",

    AUTO_STATUS:
      process.env.AUTO_STATUS === "true",

    WELCOME:
      process.env.WELCOME !== "false",

    GOODBYE:
      process.env.GOODBYE !== "false",

    ANTI_LINK:
      process.env.ANTI_LINK === "true",

    ANTI_CALL:
      process.env.ANTI_CALL === "true"

  },


  // =====================================================
  // MESSAGE LIMITS
  // =====================================================

  MAX_MESSAGE_LENGTH:
    Number(
      process.env.MAX_MESSAGE_LENGTH ||
      4096
    ),


  // =====================================================
  // LOGGING
  // =====================================================

  LOG_LEVEL:
    process.env.LOG_LEVEL ||
    "silent"

};