const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { uploadImage } = require('../lib/uploadImage');
const { channelInfo, vipBox, react } = require('../lib/muzStyle');

const REMOVEBG_API = 'https://apis.davidcyriltech.my.id/removebg?url=';
// imgbb key: Railway/panel variable IMGBB_API_KEY me daalo (https://api.imgbb.com se free key)
const getImgbbKey = () => String(process.env.IMGBB_API_KEY || '').trim();

async function getImageBuffer(message) {
    const ctx = message.message?.extendedTextMessage?.contextInfo
        || message.message?.imageMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const node = quoted?.imageMessage || message.message?.imageMessage;
    if (!node) return null;
    const stream = await downloadContentFromMessage(node, 'image');
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

// 1) imgbb pe upload  2) fail/no-key ho to purana uploader fallback
async function uploadToImgbb(buffer) {
    const key = getImgbbKey();
    if (key) {
        try {
            const form = new FormData();
            form.append('image', buffer.toString('base64'));
            const res = await axios.post(`https://api.imgbb.com/1/upload?key=${key}`, form, {
                headers: form.getHeaders(), timeout: 30000, maxBodyLength: Infinity
            });
            const url = res.data?.data?.url;
            if (url) return url;
        } catch (e) {
            console.error('imgbb upload failed, using fallback:', e.message);
        }
    }
    return await uploadImage(buffer);
}

function findUrl(obj) {
    if (!obj) return null;
    if (typeof obj === 'string') return /^https?:\/\//i.test(obj) ? obj : null;
    if (typeof obj === 'object') {
        for (const k of ['url', 'result', 'image', 'imageUrl', 'output', 'data']) {
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

        const imgUrl = await uploadToImgbb(buffer);
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
