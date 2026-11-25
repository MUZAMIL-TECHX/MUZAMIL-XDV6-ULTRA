// ═══════════════════════════════════════════════════════════
//   🎨 MUZAMIL-XD — SHARED STYLE (same font + newsletter forward)
// ═══════════════════════════════════════════════════════════
const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363426106687970@newsletter',
            newsletterName: '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫',
            serverMessageId: -1
        }
    }
};

function vipBox(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━╮\n`;
    out += `   ✦ ${title} ✦\n`;
    out += `╰━━━━━━━━━━━━━━━╯\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `━━━━━━━━━━━━━━━━\n`;
    out += `👑 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`;
    return out;
}

async function react(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, { react: { text: emoji, key: message.key } });
    } catch (_) {}
}

// Digits only, e.g. "+92 313-0122643" / "923130122643@s.whatsapp.net" -> "923130122643"
function cleanNumber(input) {
    return String(input || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

// Connected (paired) session's own inbox: "number@s.whatsapp.net"
function selfJid(sock) {
    const num = cleanNumber(sock?.user?.id || sock?.user?.jid);
    return num ? `${num}@s.whatsapp.net` : null;
}

module.exports = { channelInfo, vipBox, react, cleanNumber, selfJid };
