/**
 * MUZAMIL-XD — View-Once Saver (VVSAVER)
 * Agar koi in trigger words/emoji se VIEW-ONCE media (photo/video/audio) ka
 * reply kare, to wo media download ho kar OWNER ke inbox me chala jata hai.
 *
 * ✅ Triggers edit karne ke liye neeche VV_TRIGGERS list change karo.
 * Works on: @whiskeysockets/baileys 7.0.0-rc10
 */
const settings = require('../settings.js');

// 🔧 APNI TRIGGERS YAHAN EDIT KARO (word ya emoji kuch bhi ho sakta hai)
const VV_TRIGGERS = ["good", "super", "💋", "🙂"];

// Quoted message nikal lo (reply ka original message)
function getQuotedMessage(message) {
    return message?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
        message?.message?.imageMessage?.contextInfo?.quotedMessage ||
        message?.message?.videoMessage?.contextInfo?.quotedMessage ||
        message?.message?.audioMessage?.contextInfo?.quotedMessage || null;
}

// View-once wrapper se andar ka asli content nikal lo
function extractViewOnceContent(quoted) {
    if (!quoted) return null;
    const inner =
        quoted.viewOnceMessage?.message ||
        quoted.viewOnceMessageV2?.message ||
        quoted.viewOnceMessageV2Extension?.message ||
        quoted; // agar already andar ka content hai
    const isVV =
        inner?.imageMessage?.viewOnce ||
        inner?.videoMessage?.viewOnce ||
        inner?.audioMessage?.viewOnce ||
        quoted.viewOnceMessage || quoted.viewOnceMessageV2 || quoted.viewOnceMessageV2Extension;
    return isVV ? inner : null;
}

async function handleVvSaver(sock, chatId, message) {
    try {
        const quoted = getQuotedMessage(message);
        const inner = extractViewOnceContent(quoted);
        if (!inner) return false; // view-once reply nahi hai → normal flow chalne do

        const type = inner.imageMessage ? 'image' : inner.videoMessage ? 'video' : 'audio';
        const ownerJid = settings.ownerNumber + '@s.whatsapp.net';
        const senderNum = (message.key.participant || message.participant || message.key.remoteJid || '').split('@')[0].split(':')[0];
        const chatNum = (message.key.remoteJid || '').split('@')[0];
        const isGroup = message.key.remoteJid?.endsWith('@g.us');
        const time = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });

        // 📥 View-once media download
        const buffer = await sock.downloadMediaMessage(
            { key: message.key, message: quoted },
            'buffer',
            {}
        );
        if (!buffer || !buffer.length) return false;

        const caption =
            `*👁️‍🗨️ VIEW-ONCE SAVED*\n` +
            `*From:* ${senderNum}\n` +
            `*Chat:* ${isGroup ? 'Group (' + chatNum + ')' : 'Private (' + chatNum + ')'}` +
            `\n*Type:* ${type}\n*Time:* ${time}`;

        // 📤 Owner ke inbox me bhejo
        if (type === 'image') {
            await sock.sendMessage(ownerJid, { image: buffer, caption });
        } else if (type === 'video') {
            await sock.sendMessage(ownerJid, { video: buffer, caption });
        } else {
            await sock.sendMessage(ownerJid, {
                audio: buffer,
                mimetype: inner.audioMessage?.mimetype || 'audio/mp4',
                ptt: inner.audioMessage?.ptt || false
            });
            await sock.sendMessage(ownerJid, { text: caption });
        }

        // Chhota feedback reaction (silent — chat me kuch message nahi jata)
        try {
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } catch (_) {}

        console.log(`👁️‍🗨️ [VVSAVER] ${type} saved from ${senderNum} → owner inbox`);
        return true;
    } catch (err) {
        console.error('❌ [VVSAVER] Error:', err.message || err);
        return false;
    }
}

module.exports = { VV_TRIGGERS, handleVvSaver, getQuotedMessage, extractViewOnceContent };
