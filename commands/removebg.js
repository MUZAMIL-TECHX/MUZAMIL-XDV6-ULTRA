const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadBuffer } = require('../lib/uploader');
const { channelInfo, vipBox, react } = require('../lib/muzStyle');

// Flow: image -> lib/uploader (public URL) -> remove-bg API -> image back to user
const REMOVEBG_API = 'https://apis.davidcyriltech.my.id/removebg?url=';

function unwrap(m) {
    for (let i = 0; i < 5 && m; i++) {
        const n = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message
            || m.documentWithCaptionMessage?.message;
        if (!n) break;
        m = n;
    }
    return m || {};
}

async function getImageBuffer(message) {
    const content = unwrap(message.message);
    const ctx = content.extendedTextMessage?.contextInfo || content.imageMessage?.contextInfo;
    const quoted = unwrap(ctx?.quotedMessage);
    const node = quoted.imageMessage || content.imageMessage
        || (quoted.documentMessage?.mimetype?.startsWith('image/') ? quoted.documentMessage : null);
    if (!node) return null;
    const stream = await downloadContentFromMessage(node, quoted.documentMessage === node ? 'document' : 'image');
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

function findUrl(obj) {
    if (!obj) return null;
    if (typeof obj === 'string') return /^https?:\/\//i.test(obj) ? obj : null;
    if (typeof obj === 'object') {
        for (const k of ['url', 'result', 'image', 'imageUrl', 'output', 'data', 'download_url']) {
            const u = findUrl(obj[k]);
            if (u) return u;
        }
    }
    return null;
}

async function exec(sock, message) {
    const chatId = message.key.remoteJid;
    try {
        const buffer = await getImageBuffer(message);
        if (!buffer) {
            return sock.sendMessage(chatId, {
                text: vipBox('🖼️ 𝚁𝙴𝙼𝙾𝚅𝙴 𝙱𝙶', [
                    '📌 Kisi image ko reply karke likhein : .removebg',
                    '💡 Ya image ke caption me .removebg likhein'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        await react(sock, message, '⏳');

        const imgUrl = await uploadBuffer(buffer);
        const apiUrl = REMOVEBG_API + encodeURIComponent(imgUrl);

        const res = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 60000 });
        const type = String(res.headers['content-type'] || '');
        let out;

        if (type.startsWith('image/')) {
            out = Buffer.from(res.data);
        } else {
            let json;
            try { json = JSON.parse(Buffer.from(res.data).toString('utf8')); } catch (_) {}
            const finalUrl = findUrl(json);
            if (!finalUrl) throw new Error('API ne image nahi di');
            const img = await axios.get(finalUrl, { responseType: 'arraybuffer', timeout: 60000 });
            out = Buffer.from(img.data);
        }

        await sock.sendMessage(chatId, {
            image: out,
            caption: vipBox('🖼️ 𝚁𝙴𝙼𝙾𝚅𝙴 𝙱𝙶', ['✅ Background remove ho gaya!']),
            ...channelInfo
        }, { quoted: message });
        await react(sock, message, '✅');
    } catch (err) {
        console.error('RemoveBG Error:', err.message);
        await react(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', ['Background remove nahi ho saka, dobara try karein.']),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { name: 'removebg', alias: ['rmbg', 'nobg'], category: 'general', desc: 'Remove image background', exec };
