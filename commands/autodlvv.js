const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { readSessionJson, writeSessionJson, getSessionSettings } = require('../lib/session_data');
const isOwnerOrSudo = require('../lib/isOwner');
const { channelInfo, vipBox, react, cleanNumber, selfJid } = require('../lib/muzStyle');

const FILE = 'autodlvv.json';
const getCfg = (sock) => {
    const c = readSessionJson(sock, FILE, {});
    return { enabled: !!c.enabled, numbers: Array.isArray(c.numbers) ? c.numbers : [] };
};

async function ownerOnly(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    if (message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId)) return true;
    await sock.sendMessage(chatId, {
        text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', ['Sirf owner ye command use kar sakta hai.']),
        ...channelInfo
    }, { quoted: message });
    return false;
}

// .autodlvv on | off
async function autoDlVvCommand(sock, chatId, message, arg) {
    if (!(await ownerOnly(sock, chatId, message))) return;
    const cfg = getCfg(sock);
    const a = String(arg || '').trim().toLowerCase();

    if (a !== 'on' && a !== 'off') {
        return sock.sendMessage(chatId, {
            text: vipBox('📥 𝙰𝚄𝚃𝙾 𝙳𝙻 𝚅𝚅', [
                `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${cfg.enabled ? '🟢 ON' : '🔴 OFF'}`,
                `👥 𝙽𝚞𝚖𝚋𝚎𝚛𝚜 : ${cfg.numbers.length ? cfg.numbers.join(', ') : 'Sab (list khali hai)'}`,
                '• .autodlvv on / off',
                '• .autodlvvfor 92xxxxxxxxxx — number add',
                '• .autodlvvfor del 92xxxxxxxxxx — remove',
                '• .autodlvvfor list — list dekhein'
            ]),
            ...channelInfo
        }, { quoted: message });
    }

    cfg.enabled = a === 'on';
    writeSessionJson(sock, FILE, cfg);
    await react(sock, message, cfg.enabled ? '✅' : '🔕');
    await sock.sendMessage(chatId, {
        text: vipBox('📥 𝙰𝚄𝚃𝙾 𝙳𝙻 𝚅𝚅', [
            `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${cfg.enabled ? '🟢 ON' : '🔴 OFF'}`,
            cfg.numbers.length
                ? `👥 Sirf in numbers ka VV save hoga : ${cfg.numbers.join(', ')}`
                : '👥 List khali hai — sab ka VV save hoga'
        ]),
        ...channelInfo
    }, { quoted: message });
}

// .autodlvvfor 92xxxxxxxxxx | del 92xxx | list
async function autoDlVvForCommand(sock, chatId, message, arg) {
    if (!(await ownerOnly(sock, chatId, message))) return;
    const cfg = getCfg(sock);
    const parts = String(arg || '').trim().split(/\s+/).filter(Boolean);
    const sub = (parts[0] || '').toLowerCase();

    if (!parts.length || sub === 'list') {
        return sock.sendMessage(chatId, {
            text: vipBox('📥 𝙰𝚄𝚃𝙾 𝚅𝚅 𝙻𝙸𝚂𝚃', [
                cfg.numbers.length ? cfg.numbers.map((n, i) => `${i + 1}. ${n}`).join('\n▸ ') : 'List khali hai',
                '📌 Add : .autodlvvfor 92xxxxxxxxxx'
            ]),
            ...channelInfo
        }, { quoted: message });
    }

    const isDel = ['del', 'delete', 'remove', 'rm'].includes(sub);
    const num = cleanNumber(isDel ? parts[1] : parts[0]);
    if (num.length < 8) {
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙸𝙽𝚅𝙰𝙻𝙸𝙳 𝙽𝚄𝙼𝙱𝙴𝚁', ['Country code ke saath number likhein.', 'Example : .autodlvvfor 923001234567']),
            ...channelInfo
        }, { quoted: message });
    }

    if (isDel) cfg.numbers = cfg.numbers.filter(n => n !== num);
    else if (!cfg.numbers.includes(num)) cfg.numbers.push(num);
    writeSessionJson(sock, FILE, cfg);

    await react(sock, message, '✅');
    await sock.sendMessage(chatId, {
        text: vipBox('📥 𝙰𝚄𝚃𝙾 𝚅𝚅 𝙻𝙸𝚂𝚃', [
            isDel ? `🗑️ Removed : ${num}` : `➕ Added : ${num}`,
            `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${cfg.enabled ? '🟢 ON' : '🔴 OFF (.autodlvv on karein)'}`
        ]),
        ...channelInfo
    }, { quoted: message });
}

function unwrap(msg) {
    let m = msg;
    for (let i = 0; i < 6 && m; i++) {
        const next = m.ephemeralMessage?.message || m.viewOnceMessage?.message
            || m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message
            || m.documentWithCaptionMessage?.message;
        if (!next) break;
        m = next;
    }
    return m || {};
}

// Har incoming message pe chalta hai (main.js me handleAntiVv ke baad)
async function handleAutoDlVv(sock, message) {
    try {
        if (message.key?.fromMe) return false;
        const cfg = getCfg(sock);
        if (!cfg.enabled) return false;

        const content = unwrap(message.message);
        const media = content.imageMessage || content.videoMessage || content.audioMessage;
        if (!media?.viewOnce) return false;

        // Sender number (LID ho to alt fields bhi check)
        const ids = [message.key.participant, message.key.participantAlt, message.key.senderPn,
            message.key.remoteJid, message.key.remoteJidAlt].filter(Boolean).map(cleanNumber);
        if (cfg.numbers.length && !ids.some(n => cfg.numbers.includes(n))) return false;
        const senderNum = ids.find(n => cfg.numbers.includes(n)) || ids[0] || 'unknown';

        const type = content.imageMessage ? 'image' : content.videoMessage ? 'video' : 'audio';
        const stream = await downloadContentFromMessage(media, type);
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) return false;

        // Save into the CONNECTED session's own inbox (not the sender's chat / not a fixed owner)
        const ownerJid = selfJid(sock);
        if (!ownerJid) return false;
        const isGroup = String(message.key.remoteJid).endsWith('@g.us');
        const caption = vipBox(`📥 𝙰𝚄𝚃𝙾 𝚅𝚅 ${type.toUpperCase()}`, [
            `👤 𝙵𝚛𝚘𝚖 : ${senderNum}`,
            `💬 𝙲𝚑𝚊𝚝 : ${isGroup ? 'Group' : 'Private'}`,
            `🕒 𝚃𝚒𝚖𝚎 : ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`
        ]);

        if (type === 'image') await sock.sendMessage(ownerJid, { image: buffer, caption, ...channelInfo });
        else if (type === 'video') await sock.sendMessage(ownerJid, { video: buffer, caption, ...channelInfo });
        else {
            await sock.sendMessage(ownerJid, { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: !!media.ptt });
            await sock.sendMessage(ownerJid, { text: caption, ...channelInfo });
        }
        return true;
    } catch (err) {
        console.error('AutoDlVv error:', err.message);
        return false;
    }
}

module.exports = { autoDlVvCommand, autoDlVvForCommand, handleAutoDlVv };
