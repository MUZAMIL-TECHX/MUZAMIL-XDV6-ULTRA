const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const { readSessionJson, writeSessionJson } = require('../lib/session_data');

const messageStore = new Map();
const BASE_TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');
const TEMP_MEDIA_DIR = BASE_TEMP_MEDIA_DIR;

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

// Ensure tmp dir exists
if (!fs.existsSync(BASE_TEMP_MEDIA_DIR)) {
    fs.mkdirSync(BASE_TEMP_MEDIA_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════
//                    🛠️ HELPERS
// ═══════════════════════════════════════════════════════════
async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        console.error('Reaction error:', error);
    }
}

// ═══════════════════════════════════════════════════════════
//                    💎 VIP DESIGN FRAME (CLEAN)
// ═══════════════════════════════════════════════════════════
function vipBox(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━╮\n`;
    out += `   ✦ ${title} ✦\n`;
    out += `╰━━━━━━━━━━━━━━━╯\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `━━━━━━━━━━━━━━━━\n`;
    out += `👑 𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`;
    return out;
}

// ═══════════════════════════════════════════════════════════
//                    🧹 STORE LIMITS / CLEANUP
// ═══════════════════════════════════════════════════════════
const MAX_STORED = 1500;                 // max messages kept in memory
const MAX_MEDIA_BYTES = 60 * 1024 * 1024; // skip media bigger than 60MB
const MAX_AGE_MS = 24 * 60 * 60 * 1000;  // forget messages after 24h

function removeEntry(id) {
    const entry = messageStore.get(id);
    if (entry?.mediaPath) { try { fs.unlinkSync(entry.mediaPath); } catch {} }
    messageStore.delete(id);
}

function pruneStore() {
    const now = Date.now();
    for (const [id, e] of messageStore) {
        if (now - e.time > MAX_AGE_MS) removeEntry(id);
    }
    while (messageStore.size > MAX_STORED) {
        removeEntry(messageStore.keys().next().value);
    }
}
setInterval(pruneStore, 10 * 60 * 1000).unref?.();

// ═══════════════════════════════════════════════════════════
//                    ⚙️ CONFIG LOAD/SAVE
// ═══════════════════════════════════════════════════════════
// mode: 'inbox' -> deleted content goes to the owner's inbox (default)
//       'same'  -> deleted content is re-sent in the chat where it was deleted
function loadAntideleteConfig(sock) {
    const cfg = readSessionJson(sock, 'antidelete.json', { enabled: false, mode: 'inbox' });
    if (cfg.mode !== 'same') cfg.mode = 'inbox';
    return cfg;
}

function saveAntideleteConfig(sock, config) {
    try {
        writeSessionJson(sock, 'antidelete.json', config);
    } catch (err) {
        console.error('Config save error:', err);
    }
}

const isOwnerOrSudo = require('../lib/isOwner');

function modeLabel(mode) {
    return mode === 'same' ? '📍 SAME CHAT' : '📥 OWNER INBOX';
}

async function ownerGuard(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    if (!message.key.fromMe && !isOwner) {
        await addReaction(sock, message, '⛔');
        await sock.sendMessage(chatId, {
            text: vipBox('⛔ 𝙰𝙲𝙲𝙴𝚂𝚂 𝙳𝙴𝙽𝙸𝙴𝙳', ['Only the bot owner can use this command.']),
            ...channelInfo
        }, { quoted: message });
        return false;
    }
    return true;
}

// ═══════════════════════════════════════════════════════════
//                    🚀 COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════
async function handleAntideleteCommand(sock, chatId, message, match) {
    try {
        await addReaction(sock, message, '🛡️');
        if (!(await ownerGuard(sock, chatId, message))) return;

        const config = loadAntideleteConfig(sock);
        const arg = String(match || '').trim().toLowerCase();

        if (!arg) {
            await addReaction(sock, message, '📋');
            return sock.sendMessage(chatId, {
                text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙴𝙽𝚄', [
                    `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 ON' : '🔴 OFF'}`,
                    `📦 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`,
                    '📌 𝚄𝚜𝚊𝚐𝚎 :',
                    '• .antidelete on — Enable',
                    '• .antidelete off — Disable',
                    '• .antideleteset inbox — Send to owner inbox',
                    '• .antideleteset same — Send in same chat'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // allow ".antidelete set inbox|same" too
        const setMatch = arg.match(/^set\s+(inbox|same)$/);
        if (setMatch) return applyMode(sock, chatId, message, config, setMatch[1]);

        if (arg !== 'on' && arg !== 'off') {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: vipBox('❌ 𝙸𝙽𝚅𝙰𝙻𝙸𝙳 𝙲𝙾𝙼𝙼𝙰𝙽𝙳', ['Use .antidelete to see usage.']),
                ...channelInfo
            }, { quoted: message });
        }

        config.enabled = arg === 'on';
        saveAntideleteConfig(sock, config);
        await addReaction(sock, message, config.enabled ? '✅' : '🔕');
        return sock.sendMessage(chatId, {
            text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝚄𝙿𝙳𝙰𝚃𝙴𝙳', [
                `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 ON' : '🔴 OFF'}`,
                `📦 𝙼𝚘𝚍𝚎 : ${modeLabel(config.mode)}`
            ]),
            ...channelInfo
        }, { quoted: message });
    } catch (error) {
        console.error('Antidelete command error:', error);
        await addReaction(sock, message, '❌');
        return sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', ['Error processing command.']),
            ...channelInfo
        }, { quoted: message });
    }
}

async function applyMode(sock, chatId, message, config, mode) {
    config.mode = mode;
    saveAntideleteConfig(sock, config);
    await addReaction(sock, message, '✅');
    return sock.sendMessage(chatId, {
        text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙾𝙳𝙴 𝚂𝙴𝚃', [
            `📦 𝙼𝚘𝚍𝚎 : ${modeLabel(mode)}`,
            mode === 'same'
                ? 'Deleted messages are re-sent in the chat where they were deleted.'
                : 'Deleted messages are sent to the owner inbox.',
            `📊 𝚂𝚝𝚊𝚝𝚞𝚜 : ${config.enabled ? '🟢 ON' : '🔴 OFF (use .antidelete on)'}`
        ]),
        ...channelInfo
    }, { quoted: message });
}

// .antideleteset inbox | same
async function handleAntideleteSetCommand(sock, chatId, message, match) {
    try {
        if (!(await ownerGuard(sock, chatId, message))) return;
        const config = loadAntideleteConfig(sock);
        const arg = String(match || '').trim().toLowerCase();
        if (arg !== 'inbox' && arg !== 'same') {
            await addReaction(sock, message, '📋');
            return sock.sendMessage(chatId, {
                text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝚂𝙴𝚃', [
                    `📦 𝙲𝚞𝚛𝚛𝚎𝚗𝚝 : ${modeLabel(config.mode)}`,
                    '• .antideleteset inbox — Send to owner inbox',
                    '• .antideleteset same — Send in same chat'
                ]),
                ...channelInfo
            }, { quoted: message });
        }
        return applyMode(sock, chatId, message, config, arg);
    } catch (error) {
        console.error('Antideleteset error:', error);
    }
}

// ═══════════════════════════════════════════════════════════
//                    📥 STORE MESSAGES
// ═══════════════════════════════════════════════════════════
async function downloadToFile(media, type, filePath) {
    const stream = await downloadContentFromMessage(media, type);
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > MAX_MEDIA_BYTES) throw new Error('media too large');
        chunks.push(chunk);
    }
    await writeFile(filePath, Buffer.concat(chunks));
}

// Strip ephemeral / view-once / edited wrappers so every type is detected.
function unwrap(msg) {
    let m = msg;
    let viewOnce = false;
    for (let i = 0; i < 5 && m; i++) {
        if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
        if (m.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; viewOnce = true; continue; }
        if (m.viewOnceMessageV2Extension?.message) { m = m.viewOnceMessageV2Extension.message; viewOnce = true; continue; }
        if (m.viewOnceMessage?.message) { m = m.viewOnceMessage.message; viewOnce = true; continue; }
        if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
        break;
    }
    return { m: m || {}, viewOnce };
}

async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig(sock);
        if (!config.enabled) return;
        if (!message?.key?.id || !message.message) return;
        if (message.key.fromMe) return;
        if (message.key.remoteJid === 'status@broadcast') return;
        if (message.message.protocolMessage) return;

        const messageId = message.key.id;
        const sender = message.key.participant || message.key.remoteJid;
        const { m, viewOnce } = unwrap(message.message);

        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let mimetype = '';
        let ptt = false;
        let fileName = '';

        if (m.conversation) {
            content = m.conversation;
        } else if (m.extendedTextMessage?.text) {
            content = m.extendedTextMessage.text;
        } else if (m.imageMessage) {
            mediaType = 'image';
            content = m.imageMessage.caption || '';
            mimetype = m.imageMessage.mimetype || 'image/jpeg';
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
            await downloadToFile(m.imageMessage, 'image', mediaPath);
        } else if (m.videoMessage) {
            mediaType = 'video';
            content = m.videoMessage.caption || '';
            mimetype = m.videoMessage.mimetype || 'video/mp4';
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
            await downloadToFile(m.videoMessage, 'video', mediaPath);
        } else if (m.audioMessage) {
            mediaType = 'audio';
            ptt = !!m.audioMessage.ptt;
            mimetype = m.audioMessage.mimetype || (ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg');
            const ext = /ogg|opus/.test(mimetype) ? 'ogg' : (/mp4|m4a|aac/.test(mimetype) ? 'm4a' : 'mp3');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
            await downloadToFile(m.audioMessage, 'audio', mediaPath);
        } else if (m.stickerMessage) {
            mediaType = 'sticker';
            mimetype = m.stickerMessage.mimetype || 'image/webp';
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
            await downloadToFile(m.stickerMessage, 'sticker', mediaPath);
        } else if (m.documentMessage) {
            mediaType = 'document';
            content = m.documentMessage.caption || '';
            mimetype = m.documentMessage.mimetype || 'application/octet-stream';
            fileName = m.documentMessage.fileName || `${messageId}`;
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}_${path.basename(fileName)}`);
            await downloadToFile(m.documentMessage, 'document', mediaPath);
        } else {
            return; // unsupported type (polls, locations, etc.)
        }

        const chatJid = message.key.remoteJid;
        messageStore.set(messageId, {
            content, mediaType, mediaPath, mimetype, ptt, fileName,
            sender,
            chat: chatJid,
            group: chatJid.endsWith('@g.us') ? chatJid : null,
            time: Date.now()
        });
        pruneStore();

        // Anti-ViewOnce: forward view-once image/video to owner right away
        if (viewOnce && (mediaType === 'image' || mediaType === 'video') && fs.existsSync(mediaPath)) {
            try {
                const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const caption = vipBox(`🛡️ 𝙰𝙽𝚃𝙸-𝚅𝙸𝙴𝚆𝙾𝙽𝙲𝙴 ${mediaType.toUpperCase()}`, [
                    `👤 𝙵𝚛𝚘𝚖 : @${sender.split('@')[0]}`
                ]);
                await sock.sendMessage(ownerNumber, {
                    [mediaType]: { url: mediaPath },
                    caption,
                    mentions: [sender],
                    ...channelInfo
                });
            } catch (e) {}
        }
    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// ═══════════════════════════════════════════════════════════
//                    🗑️ HANDLE DELETION
// ═══════════════════════════════════════════════════════════
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig(sock);
        if (!config.enabled) return;

        const protocol = revocationMessage.message?.protocolMessage;
        const messageId = protocol?.key?.id;
        if (!messageId) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const deletedBy = revocationMessage.participant
            || revocationMessage.key?.participant
            || (original.group ? original.sender : revocationMessage.key?.remoteJid)
            || original.sender;

        // Ignore deletions done by the bot / owner account itself
        if (revocationMessage.key?.fromMe || deletedBy.split(':')[0].split('@')[0] === sock.user.id.split(':')[0].split('@')[0]) {
            removeEntry(messageId);
            return;
        }

        const sender = original.sender;
        const senderName = sender.split('@')[0];

        let groupName = '';
        if (original.group) {
            try { groupName = (await sock.groupMetadata(original.group)).subject; } catch {}
        }

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Karachi',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        // inbox -> owner's inbox | same -> chat where it was deleted
        const target = config.mode === 'same' ? original.chat : ownerNumber;

        const lines = [
            `🗑️ 𝙳𝚎𝚕𝚎𝚝𝚎𝚍 𝙱𝚢 : @${deletedBy.split('@')[0]}`,
            `👤 𝚂𝚎𝚗𝚍𝚎𝚛 : @${senderName}`,
            `🕐 𝚃𝚒𝚖𝚎 : ${time}`
        ];
        if (config.mode !== 'same') lines.splice(2, 0, `📱 𝙽𝚞𝚖𝚋𝚎𝚛 : ${senderName}`);
        if (groupName) lines.push(`👥 𝙶𝚛𝚘𝚞𝚙 : ${groupName}`);
        if (original.content) lines.push(`💬 𝙼𝚎𝚜𝚜𝚊𝚐𝚎 : ${original.content}`);

        const mentions = [...new Set([deletedBy, sender])];
        const hasMedia = original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath);

        try {
            if (!hasMedia) {
                // plain text
                await sock.sendMessage(target, {
                    text: vipBox('🛡️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙳𝙴𝚃𝙴𝙲𝚃𝙴𝙳', lines),
                    mentions,
                    ...channelInfo
                });
            } else {
                const caption = vipBox(`🛡️ 𝙳𝙴𝙻𝙴𝚃𝙴𝙳 ${original.mediaType.toUpperCase()}`, lines);
                const file = { url: original.mediaPath };

                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(target, { image: file, caption, mentions, ...channelInfo });
                        break;
                    case 'video':
                        await sock.sendMessage(target, { video: file, caption, mentions, ...channelInfo });
                        break;
                    case 'document':
                        await sock.sendMessage(target, {
                            document: file,
                            mimetype: original.mimetype,
                            fileName: original.fileName || 'file',
                            caption, mentions, ...channelInfo
                        });
                        break;
                    case 'audio':
                        // audio/stickers cannot carry captions -> send info first
                        await sock.sendMessage(target, {
                            text: vipBox(`🛡️ 𝙳𝙴𝙻𝙴𝚃𝙴𝙳 ${original.ptt ? '𝚅𝙾𝙸𝙲𝙴 𝙽𝙾𝚃𝙴' : '𝙰𝚄𝙳𝙸𝙾'}`, lines),
                            mentions, ...channelInfo
                        });
                        await sock.sendMessage(target, {
                            audio: file,
                            mimetype: original.mimetype || 'audio/mpeg',
                            ptt: original.ptt
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(target, {
                            text: vipBox('🛡️ 𝙳𝙴𝙻𝙴𝚃𝙴𝙳 𝚂𝚃𝙸𝙲𝙺𝙴𝚁', lines),
                            mentions, ...channelInfo
                        });
                        await sock.sendMessage(target, { sticker: file });
                        break;
                }
            }
        } catch (err) {
            console.error('Antidelete send error:', err);
            await sock.sendMessage(ownerNumber, {
                text: vipBox('⚠️ 𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙴𝚁𝚁𝙾𝚁', [err.message]),
                ...channelInfo
            }).catch(() => {});
        }

        removeEntry(messageId);
    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

module.exports = {
    handleAntideleteCommand,
    handleAntideleteSetCommand,
    handleMessageRevocation,
    storeMessage
};
