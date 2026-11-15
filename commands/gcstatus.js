const {
    downloadContentFromMessage,
    generateWAMessageContent,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');
const crypto = require('crypto');

// ===============================
// 🎯 CHANNEL INFO
// ===============================
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

// ===============================
// 🛠️ HELPERS
// ===============================

async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (e) {
        console.error('Reaction error:', e);
    }
}

function unwrapMessage(message) {
    let current = message;
    let guard = 0;
    while (current && guard++ < 10) {
        if (current.ephemeralMessage?.message) { current = current.ephemeralMessage.message; continue; }
        if (current.viewOnceMessage?.message) { current = current.viewOnceMessage.message; continue; }
        if (current.viewOnceMessageV2?.message) { current = current.viewOnceMessageV2.message; continue; }
        if (current.viewOnceMessageV2Extension?.message) { current = current.viewOnceMessageV2Extension.message; continue; }
        if (current.documentWithCaptionMessage?.message) { current = current.documentWithCaptionMessage.message; continue; }
        if (current.editedMessage?.message) { current = current.editedMessage.message; continue; }
        break;
    }
    return current || {};
}

// ✅ view-once detect — wrapper YA inner flag
function isViewOnce(rawQuoted) {
    if (!rawQuoted || typeof rawQuoted !== 'object') return false;
    if (rawQuoted.viewOnceMessage) return true;
    if (rawQuoted.viewOnceMessageV2) return true;
    if (rawQuoted.viewOnceMessageV2Extension) return true;
    const inner = unwrapMessage(rawQuoted);
    return Boolean(
        inner?.imageMessage?.viewOnce ||
        inner?.videoMessage?.viewOnce ||
        inner?.audioMessage?.viewOnce ||
        inner?.documentMessage?.viewOnce
    );
}

function getContextInfo(message) {
    const m = message?.message || {};
    return (
        m.extendedTextMessage?.contextInfo ||
        m.imageMessage?.contextInfo ||
        m.videoMessage?.contextInfo ||
        m.audioMessage?.contextInfo ||
        m.documentMessage?.contextInfo ||
        m.stickerMessage?.contextInfo ||
        m.buttonsResponseMessage?.contextInfo ||
        m.listResponseMessage?.contextInfo ||
        m.templateButtonReplyMessage?.contextInfo ||
        {}
    );
}

function quotedMessageOf(message) {
    const ctx = getContextInfo(message);
    return unwrapMessage(ctx?.quotedMessage || {});
}

function rawQuotedOf(message) {
    const ctx = getContextInfo(message);
    return ctx?.quotedMessage || {};
}

async function downloadMedia(media, type) {
    try {
        const stream = await downloadContentFromMessage(media, type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
    } catch (e) {
        console.error('Download media error:', e);
        return null;
    }
}

function ownerJid(sock) {
    const raw = String(sock?.user?.id || sock?.user?.jid || '');
    const num = raw.split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    return num ? `${num}@s.whatsapp.net` : null;
}

// ===============================
// 📤 BUILD INNER MESSAGE (RC-10)
// ===============================
async function buildInnerMessage(sock, content) {
    const uploader =
        (typeof sock.waUploadToServer === 'function' && sock.waUploadToServer) ||
        (typeof sock.upload === 'function' && sock.upload) ||
        null;

    if (!uploader) {
        throw new Error(
            'Media uploader not available. RC-10 mein makeWASocket se sock.waUploadToServer milta hai.'
        );
    }

    return await generateWAMessageContent(content, { upload: uploader });
}

// ===============================
// ✅ GROUP STATUS SENDER
// ===============================
async function sendGroupStatus(sock, groupJid, content) {
    if (!groupJid?.endsWith('@g.us')) {
        throw new Error('This command can only be used in a group.');
    }

    const messageSecret = crypto.randomBytes(32);
    const innerMessage = await buildInnerMessage(sock, content);

    const wrapped = generateWAMessageFromContent(
        groupJid,
        {
            messageContextInfo: { messageSecret },
            groupStatusMessageV2: {
                message: {
                    ...innerMessage,
                    messageContextInfo: { messageSecret }
                }
            }
        },
        {}
    );

    await sock.relayMessage(groupJid, wrapped.message, {
        messageId: wrapped.key.id
    });
    return true;
}

// ===============================
// 📡 GCSTATUS
// ===============================
async function gcstatusCommand(sock, chatId, message, commandText = '') {
    try {
        await addReaction(sock, message, '📡');

        if (!chatId?.endsWith('@g.us')) {
            await addReaction(sock, message, '❌');
            await sock.sendMessage(chatId, {
                text: `
╭┈──〔 ❌ ɢʀᴏᴜᴘ ᴏɴʟʏ 〕┈──⊷
┋⋄ ➠ 🔴 ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ꜰᴏʀ ɢʀᴏᴜᴘs ᴏɴʟʏ
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        const quoted = quotedMessageOf(message);
        const quotedText =
            quoted.conversation ||
            quoted.extendedTextMessage?.text ||
            quoted.imageMessage?.caption ||
            quoted.videoMessage?.caption ||
            quoted.documentMessage?.caption ||
            '';
        const directText = String(commandText || '').trim();
        const hasMedia =
            quoted.imageMessage ||
            quoted.videoMessage ||
            quoted.audioMessage ||
            quoted.documentMessage;

        if (!hasMedia && !quotedText && !directText) {
            await addReaction(sock, message, '❌');
            await sock.sendMessage(chatId, {
                text: `
╭┈──〔 ❌ ɴᴏ ʀᴇᴘʟʏ 〕┈──⊷
┋⋄ ➠ 📌 ʀᴇᴘʟʏ ᴛᴏ ᴀɴʏ ᴍᴇᴅɪᴀ ᴏʀ ᴛᴇxᴛ
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        let statusContent;
        try {
            if (quoted.imageMessage) {
                const buffer = await downloadMedia(quoted.imageMessage, 'image');
                if (!buffer) throw new Error('Failed to download image');
                statusContent = { image: buffer, caption: quoted.imageMessage.caption || undefined };
            } else if (quoted.videoMessage) {
                const buffer = await downloadMedia(quoted.videoMessage, 'video');
                if (!buffer) throw new Error('Failed to download video');
                statusContent = {
                    video: buffer,
                    caption: quoted.videoMessage.caption || undefined,
                    mimetype: quoted.videoMessage.mimetype || 'video/mp4'
                };
            } else if (quoted.audioMessage) {
                const buffer = await downloadMedia(quoted.audioMessage, 'audio');
                if (!buffer) throw new Error('Failed to download audio');
                statusContent = {
                    audio: buffer,
                    mimetype: quoted.audioMessage.mimetype || 'audio/mpeg',
                    ptt: Boolean(quoted.audioMessage.ptt)
                };
            } else if (quoted.documentMessage) {
                const buffer = await downloadMedia(quoted.documentMessage, 'document');
                if (!buffer) throw new Error('Failed to download document');
                statusContent = {
                    document: buffer,
                    mimetype: quoted.documentMessage.mimetype || 'application/octet-stream',
                    fileName: quoted.documentMessage.fileName || 'status-file',
                    caption: quoted.documentMessage.caption || undefined
                };
            } else {
                statusContent = { text: quotedText || directText };
            }
        } catch (downloadError) {
            await addReaction(sock, message, '❌');
            await sock.sendMessage(chatId, {
                text: `
╭┈──〔 ❌ ᴅᴏᴡɴʟᴏᴀᴅ ꜰᴀɪʟᴇᴅ 〕┈──⊷
┋⋄ ➠ 🔴 ${downloadError.message || 'Could not download media'}
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        try {
            await sendGroupStatus(sock, chatId, statusContent);
            await addReaction(sock, message, '✅');
            await sock.sendMessage(chatId, {
                text: `
╭┈──〔 ✅ sᴛᴀᴛᴜs ᴘᴏsᴛᴇᴅ 〕┈──⊷
┋⋄ ➠ 📡 ᴘᴏsᴛᴇᴅ ᴛᴏ ɢʀᴏᴜᴘ sᴛᴀᴛᴜs
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        } catch (sendError) {
            console.error('Group status send error:', sendError);
            await addReaction(sock, message, '❌');
            await sock.sendMessage(chatId, {
                text: `
╭┈──〔 ❌ ᴘᴏsᴛ ꜰᴀɪʟᴇᴅ 〕┈──⊷
┋⋄ ➠ 🔴 ${sendError.message || 'Could not post'}
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        }
    } catch (error) {
        console.error('GCStatus error:', error);
        await addReaction(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: `
╭┈──〔 ❌ ᴇʀʀᴏʀ 〕┈──⊷
┋⋄ ➠ 🔴 ${error.message || 'Something went wrong'}
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
            ...channelInfo
        }, { quoted: message });
    }
}

// ===============================
// 🎯 TRIGGERS
// ===============================
const VIEW_ONCE_SAVE_TRIGGERS = new Set([
    'good', 'cute', 'mashallah', 'wow', 'sosad', 'hehe',
    '🙂', '🥰', '😢'
]);

const STATUS_SAVE_TRIGGERS = new Set([
    'wow', 'good', 'acha', 'sendme'
]);

// ===============================
// 🧾 SENDER + QUOTED HELPERS
// ===============================
function senderDetails(message) {
    const sender = message?.key?.participant || message?.key?.remoteJid || '';
    const number = String(sender).split('@')[0].split(':')[0];
    return { sender, label: number ? `@${number}` : 'Unknown sender' };
}

function quotedTextOf(quoted) {
    return (
        quoted?.conversation ||
        quoted?.extendedTextMessage?.text ||
        quoted?.imageMessage?.caption ||
        quoted?.videoMessage?.caption ||
        quoted?.documentMessage?.caption ||
        ''
    );
}

function quotedMediaOf(quoted) {
    if (quoted?.imageMessage) return { media: quoted.imageMessage, type: 'image' };
    if (quoted?.videoMessage) return { media: quoted.videoMessage, type: 'video' };
    if (quoted?.audioMessage) return { media: quoted.audioMessage, type: 'audio' };
    if (quoted?.documentMessage) return { media: quoted.documentMessage, type: 'document' };
    return null;
}

// ===============================
// 💾 SEND QUOTED TO OWNER
// ===============================
async function sendQuotedToOwner(sock, message, trigger, { requireViewOnce = false } = {}) {
    try {
        const rawQuoted = rawQuotedOf(message);
        const quoted = unwrapMessage(rawQuoted);
        const quotedMedia = quotedMediaOf(quoted);
        const quotedText = quotedTextOf(quoted);

        if (requireViewOnce && !isViewOnce(rawQuoted)) return false;
        if (!quotedMedia && !quotedText) return false;

        const target = ownerJid(sock);
        if (!target) {
            console.warn('⚠️ Owner JID not available — bot not connected yet?');
            return false;
        }

        const { sender, label } = senderDetails(message);

        if (!quotedMedia) {
            await sock.sendMessage(target, {
                text: `${quotedText}\n\nSaved by reply: ${trigger}\nFrom: ${label}`,
                mentions: sender ? [sender] : []
            });
            return true;
        }

        const { media, type } = quotedMedia;
        const buffer = await downloadMedia(media, type);
        if (!buffer) return false;

        const baseCaption = media.caption ? `${media.caption}\n\n` : '';
        const caption = `${baseCaption}Saved by reply: ${trigger}\nFrom: ${label}`;
        const mentions = sender ? [sender] : [];

        let payload;
        if (type === 'image') payload = { image: buffer, caption, mentions };
        else if (type === 'video') payload = { video: buffer, caption, mentions, mimetype: media.mimetype || 'video/mp4' };
        else if (type === 'audio') payload = { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: Boolean(media.ptt) };
        else payload = {
            document: buffer,
            fileName: media.fileName || 'saved-media',
            mimetype: media.mimetype || 'application/octet-stream',
            caption,
            mentions
        };

        await sock.sendMessage(target, payload);
        return true;
    } catch (error) {
        console.error('Owner media save error:', error);
        return false;
    }
}

// ===============================
// 🎯 PUBLIC COMMAND HANDLERS
// ===============================
async function goodCommand(sock, message, trigger = 'good') {
    const t = String(trigger || '').trim().toLowerCase();
    if (!VIEW_ONCE_SAVE_TRIGGERS.has(t)) return false;
    return sendQuotedToOwner(sock, message, t, { requireViewOnce: true });
}

async function statusSaveCommand(sock, message, trigger) {
    const t = String(trigger || '').trim().toLowerCase();
    if (!STATUS_SAVE_TRIGGERS.has(t)) return false;

    const ctx = getContextInfo(message);
    const isStatusReply =
        message?.key?.remoteJid === 'status@broadcast' ||
        ctx?.remoteJid === 'status@broadcast';
    if (!isStatusReply) return false;

    const quoted = quotedMessageOf(message);
    if (!quotedMediaOf(quoted) && !quotedTextOf(quoted)) return false;
    return sendQuotedToOwner(sock, message, t);
}

// ===============================
// 🧠 AUTO HANDLER (ek hi baar wire ho jata hai)
// ===============================
const _wiredSocks = new WeakSet();

/**
 * ✅ SABSE IMPORTANT FUNCTION
 * Bot main file mein sirf ye call karo message event ke andar:
 *   await handleIncomingMessage(sock, msg);
 * Bas. Aur kuch nahi.
 */
async function handleIncomingMessage(sock, message) {
    if (!sock || !message || !message.message) return false;

    // ek hi sock pe ek hi baar wire ho
    if (typeof sock.ev?.on === 'function' && !_wiredSocks.has(sock)) {
        _wiredSocks.add(sock);
    }

    const chatId = message.key?.remoteJid;
    if (!chatId) return false;

    // text nikaalo
    const m = message.message;
    let text = '';
    if (m.conversation) text = m.conversation;
    else if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;
    else if (m.buttonsResponseMessage?.selectedButtonId) text = m.buttonsResponseMessage.selectedButtonId;
    else if (m.listResponseMessage?.singleSelectReply?.selectedRowId) text = m.listResponseMessage.singleSelectReply.selectedRowId;
    else if (m.templateButtonReplyMessage?.selectedId) text = m.templateButtonReplyMessage.selectedId;

    if (!text || typeof text !== 'string') return false;

    const cmd = text.trim().toLowerCase();
    if (!cmd) return false;

    // 🎯 View-once save triggers
    if (VIEW_ONCE_SAVE_TRIGGERS.has(cmd)) {
        const ok = await goodCommand(sock, message, cmd);
        if (ok) return true;
    }

    // 🎯 Status save triggers
    if (STATUS_SAVE_TRIGGERS.has(cmd)) {
        const ok = await statusSaveCommand(sock, message, cmd);
        if (ok) return true;
    }

    // 📡 gcstatus command
    if (cmd === '.gcstatus' || cmd === '!gcstatus' || cmd === '/gcstatus') {
        const arg = text.replace(/^[.!/]gcstatus\s*/i, '').trim();
        await gcstatusCommand(sock, chatId, message, arg);
        return true;
    }

    return false;
}

// ===============================
// 📦 EXPORTS
// ===============================
module.exports = {
    gcstatusCommand,
    goodCommand,
    statusSaveCommand,
    handleIncomingMessage,
    isViewOnce,
    unwrapMessage,
    getContextInfo,
    VIEW_ONCE_SAVE_TRIGGERS,
    STATUS_SAVE_TRIGGERS
};
