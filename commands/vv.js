// ═══════════════════════════════════════════════════════════
//   👁️ VIEW ONCE SYSTEM — PORTED FROM MISHU-MD (view-once.js)
//   🔥 .vv | .vv2 | .vvkeywords | .addkeyword | .removekeyword
//   🎀 Auto keyword trigger (no prefix) — owner only
// ═══════════════════════════════════════════════════════════
const vo = require('../lib/viewonce');
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

// Core no-prefix triggers (from the Arslan-MD vv plugin) — configurable in
// settings.js → VV_TRIGGERS. These also answer with an error when the reply
// is NOT a view-once; the softer keywords below stay silent in that case.
function getCoreTriggers() {
    const list = Array.isArray(settings.VV_TRIGGERS) && settings.VV_TRIGGERS.length
        ? settings.VV_TRIGGERS
        : ['vv', 'wah'];
    return list.map(t => String(t).trim().toLowerCase()).filter(Boolean);
}

function getKeywords() {
    let extra = [];
    try {
        const saved = readSessionJson(null, 'vvkeywords.json', { extra: [] });
        extra = Array.isArray(saved.extra) ? saved.extra : [];
    } catch (e) { /* ignore */ }
    let legacy = [];
    try { legacy = Array.from(require('./gcstatus').VIEW_ONCE_SAVE_TRIGGERS || []); } catch (e) { /* ignore */ }
    return Array.from(new Set([...getCoreTriggers(), ...DEFAULT_KEYWORDS, ...legacy, ...extra]));
}

// ═══════════════════════════════════════════════════════════
//                    🛠️ HELPERS
// ═══════════════════════════════════════════════════════════
// The vv system never reacts (owner request) — kept as a no-op so the
// sub-command code below stays untouched.
async function addReaction() { /* no react on .vv */ }

function vipBox(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━╮\n`;
    out += `   ✦ ${title} ✦\n`;
    out += `╰━━━━━━━━━━━━━━━╯\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `━━━━━━━━━━━━━━━━\n`;
    out += `👑 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`;
    return out;
}

function quotedMessageOf(message) {
    return vo.getQuotedMessage(message);
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function typeLabel(mtype) {
    if (mtype === 'image') return 'image';
    if (mtype === 'video') return 'video';
    return 'voice note';
}

async function say(sock, chatId, message, title, lines) {
    return sock.sendMessage(chatId, { text: vipBox(title, lines), ...channelInfo }, { quoted: message });
}

// ═══════════════════════════════════════════════════════════
//   🔥 CORE: RETRIEVE VIEW-ONCE → SEND TO THE BOT'S OWN CHAT
//   (bot number = owner's "Message yourself" chat). No reactions.
//   Returns true when the message was handled (success OR a reply was
//   sent), false when it was not a view-once reply and nothing was sent.
// ═══════════════════════════════════════════════════════════
async function handleViewOnce(sock, chatId, message, { quiet = false } = {}) {
    const result = await vo.retrieveViewOnce(sock, message);

    if (result.status === 'no-quote') {
        if (quiet) return false;
        await say(sock, chatId, message, '📥 𝚅𝙸𝙴𝚆 𝙾𝙽𝙲𝙴', [
            'Reply to a view-once photo, video or voice note',
            'Then send: .vv (or just vv)'
        ]);
        return true;
    }
    if (result.status === 'not-viewonce') {
        if (quiet) return false;
        await say(sock, chatId, message, '❌ 𝙽𝙾𝚃 𝚅𝙸𝙴𝚆-𝙾𝙽𝙲𝙴', [
            "That message isn't a view-once photo/video/voice note"
        ]);
        return true;
    }
    if (result.status === 'unavailable') {
        await say(sock, chatId, message, '📵 𝚅𝙸𝙴𝚆 𝙾𝙽𝙲𝙴 𝚄𝙽𝙰𝚅𝙰𝙸𝙻𝙰𝙱𝙻𝙴', [
            'WhatsApp did not deliver the media to this device',
            'Reconnect the number once — the bot now runs as',
            'Android automatically after pairing'
        ]);
        return true;
    }
    if (result.status !== 'ok') {
        await say(sock, chatId, message, '❌ 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳 𝙵𝙰𝙸𝙻𝙴𝙳', [
            result.status === 'no-key'
                ? 'WhatsApp did not give the media payload to this device'
                : 'Could not download the view-once media',
            'Open it on your phone, let it load, then quote it again'
        ]);
        return true;
    }

    const { buffer, mtype, msgObj } = result;
    const DESCRIPTION = settings.description || '𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗕𝘆 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫';
    const ctx = vo.getContextInfo(message) || {};
    const sender = ctx.participant || ctx.remoteJid || message.key.participant || message.key.remoteJid;
    const senderLabel = `@${String(sender).split('@')[0].split(':')[0]}`;
    const originalCaption = msgObj?.caption || '';

    let caption = vipBox(`📥 𝚅𝙸𝙴𝚆 𝙾𝙽𝙲𝙴 𝚂𝙰𝚅𝙴𝙳`, [
        `👤 𝚂𝚎𝚗𝚍𝚎𝚛 : ${senderLabel}`,
        `📁 𝚃𝚢𝚙𝚎 : ${typeLabel(mtype)}`,
        `📦 𝚂𝚒𝚣𝚎 : ${formatBytes(buffer.length)}`,
        originalCaption ? `📝 𝙲𝚊𝚙𝚝𝚒𝚘𝚗 : ${originalCaption}` : null
    ].filter(Boolean));
    caption += `\n\n> *© ${DESCRIPTION}*`;

    // Goes to the bot's own chat, NOT the chat where .vv was typed.
    const target = vo.selfJid(sock, chatId);

    if (mtype === 'image') {
        await sock.sendMessage(target, { image: buffer, caption, mentions: [sender], ...channelInfo }, { quoted: fakevCard });
    } else if (mtype === 'video') {
        await sock.sendMessage(target, { video: buffer, caption, mimetype: 'video/mp4', mentions: [sender], ...channelInfo }, { quoted: fakevCard });
    } else {
        await sock.sendMessage(target, {
            audio: buffer,
            mimetype: msgObj?.mimetype || 'audio/ogg; codecs=opus',
            ptt: mtype === 'ptt' || Boolean(msgObj?.ptt)
        }, { quoted: fakevCard });
        await sock.sendMessage(target, { text: caption, mentions: [sender] }, { quoted: fakevCard });
    }
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
        if (!vo.getContextInfo(message)) {
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
        if (!vo.getContextInfo(message)) return false; // must be a reply

        // Owner only
        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) return false;

        // Core words (vv / wah) explain failures; soft keywords (good, nice,
        // emojis...) stay silent unless the reply really is a view-once.
        const quiet = !getCoreTriggers().includes(normalized);
        return await handleViewOnce(sock, chatId, message, { quiet });
    } catch (error) {
        console.error('VV auto trigger error:', error.message);
        return false;
    }
}

module.exports = { vvCommand, vvAutoTrigger, handleViewOnce, getKeywords };
console.log('👁️ MUZAMIL-XD — View Once (Redx cascade) system loaded!');
