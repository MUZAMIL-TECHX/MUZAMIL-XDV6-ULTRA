// ═══════════════════════════════════════════════════════════
//   👁️ VIEW ONCE SYSTEM — PORTED FROM MISHU-MD (view-once.js)
//   🔥 .vv | .vv2 | .vvkeywords | .addkeyword | .removekeyword
//   🎀 Auto keyword trigger (no prefix) — owner only
// ═══════════════════════════════════════════════════════════
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { fakevCard } = require('../lib/fakevCard');
const isOwnerOrSudo = require('../lib/isOwner');
const { readSessionJson, writeSessionJson } = require('../lib/session_data');
const settings = require('../settings');

// ═══════════════════════════════════════════════════════════
//                    🎯 CHANNEL INFO (FORWARD ON)
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

// ═══════════════════════════════════════════════════════════
//        🎀 KEYWORDS (MISHU-MD) — default auto triggers
// ═══════════════════════════════════════════════════════════
const DEFAULT_KEYWORDS = [
    "🌸", "💖", "✨", "🎀", "💕", "💝", "🌺", "🦋", "👸", "💗",
    "nice", "good", "cute", "beautiful", "gorgeous", "lovely",
    "wow", "super", "amazing", "queen", "princess", "😍", "🥰",
    "🌝", "🥵", "💋", "👍", "🌚", "😩"
];

function getKeywords() {
    try {
        const saved = readSessionJson(null, 'vvkeywords.json', { extra: [] });
        const extra = Array.isArray(saved.extra) ? saved.extra : [];
        return Array.from(new Set([...DEFAULT_KEYWORDS, ...extra]));
    } catch (e) {
        return [...DEFAULT_KEYWORDS];
    }
}

// ═══════════════════════════════════════════════════════════
//                    🛠️ HELPERS
// ═══════════════════════════════════════════════════════════
async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) { }
}

function vipBox(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━╮\n`;
    out += `   ✦ ${title} ✦\n`;
    out += `╰━━━━━━━━━━━━━━━╯\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `━━━━━━━━━━━━━━━━\n`;
    out += `👑 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`;
    return out;
}

function unwrapMessage(message) {
    let current = message;
    while (current?.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    while (current?.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    while (current?.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    while (current?.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
    return current || {};
}

function quotedMessageOf(message) {
    const contextInfo =
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.imageMessage?.contextInfo ||
        message?.message?.videoMessage?.contextInfo ||
        message?.message?.audioMessage?.contextInfo ||
        message?.message?.documentMessage?.contextInfo ||
        {};
    return contextInfo.quotedMessage || null;
}

function ownerJid(sock) {
    const connected = String(sock?.user?.id || sock?.user?.jid || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/[^\d]/g, '');
    return connected ? `${connected}@s.whatsapp.net` : null;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ── Detect view-once content inside a quoted raw message ──
function detectViewOnce(quotedRaw) {
    if (!quotedRaw) return null;
    let wrapped = false;
    let content = quotedRaw;
    if (content.viewOnceMessage?.message) { wrapped = true; content = content.viewOnceMessage.message; }
    else if (content.viewOnceMessageV2?.message) { wrapped = true; content = content.viewOnceMessageV2.message; }
    else if (content.viewOnceMessageV2Extension?.message) { wrapped = true; content = content.viewOnceMessageV2Extension.message; }

    const image = content.imageMessage;
    const video = content.videoMessage;
    const audio = content.audioMessage;

    if (image && (wrapped || image.viewOnce)) {
        return {
            media: image, type: 'image', mimetype: image.mimetype || 'image/jpeg',
            caption: image.caption || '', ptt: false
        };
    }
    if (video && (wrapped || video.viewOnce)) {
        return {
            media: video, type: 'video', mimetype: video.mimetype || 'video/mp4',
            caption: video.caption || '', ptt: false
        };
    }
    if (audio && (wrapped || audio.viewOnce)) {
        return {
            media: audio, type: 'audio', mimetype: audio.mimetype || 'audio/ogg; codecs=opus',
            caption: '', ptt: Boolean(audio.ptt)
        };
    }
    return null;
}

// ── Robust download: direct → message store fallback ──
async function downloadMediaBuffer(sock, message, media, type) {
    try {
        const stream = await downloadContentFromMessage(media, type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        if (buf.length) return buf;
    } catch (e) {
        console.log('[VV] Direct download failed, trying store:', e.message);
    }

    try {
        const store = sock?._msgStore || global._msgStore;
        const quotedMsgId = message?.message?.extendedTextMessage?.contextInfo?.stanzaId;
        if (store instanceof Map && quotedMsgId) {
            const chat = store.get(message.key.remoteJid);
            let original = chat?.get(quotedMsgId);
            if (!original) {
                for (const [, c] of store) {
                    if (c instanceof Map && c.get(quotedMsgId)?.message) { original = c.get(quotedMsgId); break; }
                }
            }
            if (original?.message) {
                const inner = unwrapMessage(original.message)[type + 'Message'];
                if (inner && inner.mediaKey) {
                    const stream = await downloadContentFromMessage(inner, type);
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    const buf = Buffer.concat(chunks);
                    if (buf.length) return buf;
                }
            }
        }
    } catch (e) {
        console.log('[VV] Store download failed:', e.message);
    }
    return null;
}

// ═══════════════════════════════════════════════════════════
//          🔥 CORE: RETRIEVE VIEW-ONCE → SEND TO OWNER DM
// ═══════════════════════════════════════════════════════════
async function handleViewOnce(sock, chatId, message) {
    const quotedRaw = quotedMessageOf(message);
    const detected = detectViewOnce(quotedRaw);

    if (!quotedRaw) {
        await sock.sendMessage(chatId, {
            text: vipBox('👁️ 𝚅𝙸𝙴𝚆 𝙾𝙽𝙲𝙴', [
                'Reply to a view once image/video/voice',
                'Then use: .vv'
            ]),
            ...channelInfo
        }, { quoted: message });
        return false;
    }

    if (!detected) {
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙽𝙾𝚃 𝚅𝙸𝙴𝚆-𝙾𝙽𝙲𝙴', [
                'Quoted message is not a view once media',
                'Reply to a view once image/video/voice'
            ]),
            ...channelInfo
        }, { quoted: message });
        return false;
    }

    await addReaction(sock, message, '👁️');

    const buffer = await downloadMediaBuffer(sock, message, detected.media, detected.type);
    if (!buffer) {
        await addReaction(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 𝙵𝙰𝙸𝙻𝙴𝙳', [
                'Could not download media',
                'Try again or re-ask sender to resend'
            ]),
            ...channelInfo
        }, { quoted: message });
        return false;
    }

    const target = ownerJid(sock);
    if (!target) return false;

    const DESCRIPTION = settings.description || '𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗕𝘆 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫';
    const sender = message.key.participant || message.key.remoteJid;
    const senderLabel = `@${String(sender).split('@')[0].split(':')[0]}`;

    let caption = vipBox(`👁️ 𝚅𝙸𝙴𝚆 𝙾𝙽𝙲𝙴 ${detected.type.toUpperCase()}`, [
        `👤 𝚂𝚎𝚗𝚍𝚎𝚛 : ${senderLabel}`,
        `📁 𝚃𝚢𝚙𝚎 : ${detected.type}`,
        `📦 𝚂𝚒𝚣𝚎 : ${formatBytes(buffer.length)}`,
        detected.caption ? `📝 𝙲𝚊𝚙𝚝𝚒𝚘𝚗 : ${detected.caption}` : null
    ].filter(Boolean));
    caption += `\n\n> *© ${DESCRIPTION}*`;

    let payload;
    if (detected.type === 'image') {
        payload = { image: buffer, caption, mimetype: detected.mimetype, mentions: [sender], ...channelInfo };
    } else if (detected.type === 'video') {
        payload = { video: buffer, caption, mimetype: detected.mimetype, mentions: [sender], ...channelInfo };
    } else {
        payload = { audio: buffer, mimetype: detected.mimetype, ptt: detected.ptt };
    }

    await sock.sendMessage(target, payload, { quoted: fakevCard });
    await addReaction(sock, message, '✅');
    await sock.sendMessage(chatId, {
        text: vipBox('✅ 𝚂𝙰𝚅𝙴𝙳 𝚃𝙾 𝙳𝙼', [
            `📁 ${detected.type} sent to your DM`,
            senderLabel
        ]),
        ...channelInfo
    }, { quoted: message });
    return true;
}

// ═══════════════════════════════════════════════════════════
//                    👑 .VV COMMAND (owner only)
// ═══════════════════════════════════════════════════════════
async function vvCommand(sock, chatId, message, match) {
    try {
        await addReaction(sock, message, '👑');

        const senderId = message.key.participant || message.key.remoteJid;
        if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
            await addReaction(sock, message, '⛔');
            return sock.sendMessage(chatId, {
                text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', [
                    'Only the bot owner can use this command.'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        const arg = String(match || '').trim();
        const parts = arg.split(/\s+/);
        const sub = (parts[0] || '').toLowerCase();
        const keywords = getKeywords();

        // ── Sub-command: list keywords ──
        if (sub === 'keywords' || sub === 'list' || sub === 'vvkeywords') {
            await addReaction(sock, message, '📋');
            return sock.sendMessage(chatId, {
                text: vipBox(`👁️ 𝚅𝚅 𝙺𝙴𝚈𝚆𝙾𝚁𝙳𝚂 [${keywords.length}]`, [
                    ...keywords.map(k => `• ${k}`),
                    '',
                    '📌 Reply to view-once with any keyword',
                    'or use .vv to retrieve manually'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ── Sub-command: add keyword ──
        if (sub === 'add') {
            const kw = parts.slice(1).join(' ').trim().toLowerCase();
            if (!kw) {
                return sock.sendMessage(chatId, {
                    text: vipBox('❌ 𝙽𝙾 𝙺𝙴𝚈𝚆𝙾𝚁𝙳', ['Usage: .vv add beautiful']),
                    ...channelInfo
                }, { quoted: message });
            }
            if (keywords.includes(kw)) {
                return sock.sendMessage(chatId, {
                    text: vipBox('⚠️ 𝙰𝙻𝚁𝙴𝙰𝙳𝚈 𝙴𝚇𝙸𝚂𝚃𝚂', [`"${kw}" is already a keyword`]),
                    ...channelInfo
                }, { quoted: message });
            }
            const saved = readSessionJson(null, 'vvkeywords.json', { extra: [] });
            saved.extra = Array.isArray(saved.extra) ? saved.extra : [];
            saved.extra.push(kw);
            writeSessionJson(null, 'vvkeywords.json', saved);
            await addReaction(sock, message, '➕');
            return sock.sendMessage(chatId, {
                text: vipBox('✅ 𝙺𝙴𝚈𝚆𝙾𝚁𝙳 𝙰𝙳𝙳𝙴𝙳', [
                    `"${kw}" added`,
                    `Total: ${getKeywords().length} keywords`
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ── Sub-command: remove keyword ──
        if (sub === 'remove' || sub === 'del' || sub === 'delete') {
            const kw = parts.slice(1).join(' ').trim().toLowerCase();
            if (!kw) {
                return sock.sendMessage(chatId, {
                    text: vipBox('❌ 𝙽𝙾 𝙺𝙴𝚈𝚆𝙾𝚁𝙳', ['Usage: .vv remove beautiful']),
                    ...channelInfo
                }, { quoted: message });
            }
            if (DEFAULT_KEYWORDS.includes(kw)) {
                return sock.sendMessage(chatId, {
                    text: vipBox('⚠️ 𝙳𝙴𝙵𝙰𝚄𝙻𝚃 𝙺𝙴𝚈𝚆𝙾𝚁𝙳', [`"${kw}" is a default keyword and cannot be removed`]),
                    ...channelInfo
                }, { quoted: message });
            }
            const saved = readSessionJson(null, 'vvkeywords.json', { extra: [] });
            saved.extra = (Array.isArray(saved.extra) ? saved.extra : []).filter(k => k !== kw);
            writeSessionJson(null, 'vvkeywords.json', saved);
            await addReaction(sock, message, '➖');
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝙺𝙴𝚈𝚆𝙾𝚁𝙳 𝚁𝙴𝙼𝙾𝚅𝙴𝙳', [
                    `"${kw}" removed`,
                    `Total: ${getKeywords().length} keywords`
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ── Help (no reply) ──
        if (!quotedMessageOf(message)) {
            await addReaction(sock, message, '📋');
            return sock.sendMessage(chatId, {
                text: vipBox('👁️ 𝚅𝙸𝙴𝚆 𝙾𝙽𝙲𝙴 𝙷𝙴𝙻𝙿', [
                    '👑 Owner only command',
                    '',
                    '.vv — Reply to view-once to save to DM',
                    '.vv keywords — List trigger keywords',
                    '.vv add <word> — Add trigger keyword',
                    '.vv remove <word> — Remove keyword',
                    '',
                    `🎀 ${keywords.length} auto keywords active`,
                    'Reply to any view-once with a keyword',
                    'to auto-save it to your DM'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // ── Retrieve ──
        await handleViewOnce(sock, chatId, message);
    } catch (error) {
        console.error('VV command error:', error);
        await addReaction(sock, message, '❌');
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', [
                'Something went wrong.',
                'Please try again later.'
            ]),
            ...channelInfo
        }, { quoted: message });
    }
}

// ═══════════════════════════════════════════════════════════
//     🎀 AUTO TRIGGER (no prefix) — MISHU-MD KEYWORD SYSTEM
// ═══════════════════════════════════════════════════════════
async function vvAutoTrigger(sock, message, triggerText) {
    try {
        const normalized = String(triggerText || '').trim().toLowerCase();
        if (!normalized) return false;
        if (!getKeywords().includes(normalized)) return false;

        // Owner only (Mishu-MD behaviour)
        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) return false;

        const quotedRaw = quotedMessageOf(message);
        if (!quotedRaw) return false;
        if (!detectViewOnce(quotedRaw)) return false;

        return await handleViewOnce(sock, chatId, message);
    } catch (error) {
        console.error('VV auto trigger error:', error.message);
        return false;
    }
}

module.exports = { vvCommand, vvAutoTrigger, handleViewOnce, getKeywords };
console.log('👁️ MUZAMIL-XD — View Once (Mishu-MD) system loaded!');
