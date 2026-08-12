const config = require("../config");

module.exports = {
  commands: ["ping", "alive", "menu", "help", "owner", "bot"],

  async handler(sock, m, ctx) {
    const { command, from, pushName, config: cfg } = ctx;
    const botName = cfg.BOT_NAME;
    const prefix = cfg.PREFIX;

    if (command === "ping" || command === "alive") {
      const start = Date.now();
      const msg = await sock.sendMessage(from, { text: "🏓 Pong..." }, { quoted: m });
      const latency = Date.now() - start;
      await sock.sendMessage(from, {
        text: `*${botName}*\n\n🏓 Pong!\n⚡ Speed: ${latency}ms\n✅ Status: Online`,
        edit: msg.key
      });
      return;
    }

    if (command === "menu" || command === "help") {
      const menu = `
╭───「 *${botName}* 」
│ 
│ 👋 Hello *${pushName}*
│ 
│ ⚡ *Prefix:* ${prefix}
│ 
│ 📌 *Available Commands*
│ 
│ • ${prefix}ping / alive
│ • ${prefix}menu / help
│ • ${prefix}owner
│ • ${prefix}bot
│ 
│ 💡 More commands coming soon
│ 
╰───「 ${cfg.CAPTION} 」
`.trim();

      await sock.sendMessage(from, {
        image: { url: cfg.MENU_IMG },
        caption: menu
      }, { quoted: m });
      return;
    }

    if (command === "owner") {
      const ownerText = `
*Owner Info*

👤 Name: ${cfg.OWNER_NAME}
📱 Number: ${cfg.OWNER_NUMBER}
🤖 Bot: ${botName}

Contact the owner for support or custom features.
`.trim();
      await sock.sendMessage(from, { text: ownerText }, { quoted: m });
      return;
    }

    if (command === "bot") {
      await sock.sendMessage(from, {
        text: `🤖 *${botName}*\n\nA clean multi-device WhatsApp bot built with Baileys.\n\nCreated by ${cfg.OWNER_NAME}`
      }, { quoted: m });
    }
  }
};