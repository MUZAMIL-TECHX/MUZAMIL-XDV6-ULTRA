const {
    downloadContentFromMessage,
    generateWAMessageContent,
    generateWAMessageFromContent,
    Browsers
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
// ❤️ REACTION HANDLER
// ===============================
async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        console.error('Reaction error:', error);
    }
}

// ===============================
// 🔓 VIEW-ONCE UNWRAPPER (RedxBaileys safe)
// ===============================
function unwrapMessage(message) {
    let current = message;
    let guard = 0;

    while (current && guard < 8) {
        if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message;
        } else if (current.viewOnceMessage?.message) {
            current = current.viewOnceMessage.message;
        } else if (current.viewOnceMessageV2?.message) {
            current = current.viewOnceMessageV2.message;
        } else if (current.viewOnceMessageV2Extension?.message) {
            current = current.viewOnceMessageV2Extension.message;
        } else {
            break;
        }
        guard++;
    }

    return current || {};
}

// ===============================
// 💬 QUOTED MESSAGE HELPERS
// ===============================
function quotedMessageOf(message) {
    const contextInfo =
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.imageMessage?.contextInfo ||
        message?.message?.videoMessage?.contextInfo ||
        message?.message?.audioMessage?.contextInfo ||
        message?.message?.documentMessage?.contextInfo ||
        message?.message?.viewOnceMessage?.message?.imageMessage?.contextInfo ||
        message?.message?.viewOnceMessageV2?.message?.imageMessage?.contextInfo ||
        {};

    return unwrapMessage(contextInfo.quotedMessage);
}

function messageContextInfo(message) {
    return (
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.imageMessage?.contextInfo ||
        message?.message?.videoMessage?.contextInfo ||
        message?.message?.viewOnceMessageV2?.message?.imageMessage?.contextInfo ||
        {}
    );
}

// ===============================
// 📥 MEDIA DOWNLOADER
// ===============================
async function downloadMedia(media, type) {
    const stream = await downloadContentFromMessage(media, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new Error(`Downloaded ${type} media is empty`);
    return buffer;
}

// ===============================
// 👑 OWNER JID
// ===============================
function ownerJid(sock) {
    const connected = String(sock?.user?.id || sock?.user?.jid || '')
        .split('@')[0].split(':')[0].replace(/[^\d]/g, '');
    return connected ? `${connected}@s.whatsapp.net` : null;
}

// ===============================
// ☁️ MEDIA UPLOADER
// ===============================
async function uploadToWA(sock, buffer, type) {
    if (typeof sock.waUploadToServer === 'function') {
        return await sock.waUploadToServer(buffer, type);
    }
    if (sock?.mediaUploader?.upload) {
        return await sock.mediaUploader.upload(buffer, type);
    }
    throw new Error('Media uploader not available');
}

// ===============================
// 📡 GROUP STATUS SENDER
// ===============================
async function sendGroupStatus(sock, groupJid, content) {
    if (!groupJid?.endsWith('@g.us')) throw new Error('Group only.');

    const messageSecret = crypto.randomBytes(32);
    const innerMessage = await generateWAMessageContent(content, {
        upload: (buffer, type) => uploadToWA(sock, buffer, type)
    });

    const wrapped = generateWAMessageFromContent(groupJid, {
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: {
            message: { ...innerMessage, messageContextInfo: { messageSecret } }
        }
    }, {});

    await sock.relayMessage(groupJid, wrapped.message, {
        messageId: wrapped.key.id
    });
    return true;
}

// ===============================
// 📡 GCSTATUS COMMAND
// ===============================
async function gcstatusCommand(sock, chatId, message, commandText = '') {
    try {
        await addReaction(sock, message, '📡');

        if (!chatId?.endsWith('@g.us')) {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: `❌ Group only command.`, ...channelInfo
            }, { quoted: message });
        }

        const quoted = quotedMessageOf(message);
        const quotedText =
            quoted.conversation ||
            quoted.extendedTextMessage?.text ||
            quoted.imageMessage?.caption ||
            quoted.videoMessage?.caption || '';
        const directText = String(commandText || '').trim();
        const hasMedia =
            quoted.imageMessage || quoted.videoMessage ||
            quoted.audioMessage || quoted.documentMessage;

        if (!hasMedia && !quotedText && !directText) {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: `❌ Reply to media or text.`, ...channelInfo
            }, { quoted: message });
        }

        let statusContent;
        try {
            if (quoted.imageMessage) {
                statusContent = {
                    image: await downloadMedia(quoted.imageMessage, 'image'),
                    caption: quoted.imageMessage.caption || undefined
                };
            } else if (quoted.videoMessage) {
                statusContent = {
                    video: await downloadMedia(quoted.videoMessage, 'video'),
                    caption: quoted.videoMessage.caption || undefined,
                    mimetype: quoted.videoMessage.mimetype || 'video/mp4'
                };
            } else if (quoted.audioMessage) {
                statusContent = {
                    audio: await downloadMedia(quoted.audioMessage, 'audio'),
                    mimetype: quoted.audioMessage.mimetype || 'audio/mpeg',
                    ptt: Boolean(quoted.audioMessage.ptt)
                };
            } else if (quoted.documentMessage) {
                statusContent = {
                    document: await downloadMedia(quoted.documentMessage, 'document'),
                    mimetype: quoted.documentMessage.mimetype || 'application/octet-stream',
                    fileName: quoted.documentMessage.fileName || 'status-file'
                };
            } else {
                statusContent = { text: quotedText || directText };
            }
        } catch (e) {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: `❌ Download failed: ${e.message}`, ...channelInfo
            }, { quoted: message });
        }

        await sendGroupStatus(sock, chatId, statusContent);
        await addReaction(sock, message, '✅');
        await sock.sendMessage(chatId, {
            text: `✅ Status posted.`, ...channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('GCStatus error:', error);
        await addReaction(sock, message, '❌');
    }
}

// ===============================
// 🎯 TRIGGERS
// ===============================
const VIEW_ONCE_SAVE_TRIGGERS = new Set([
    'good','cute','mashallah','wow','sosad','hehe','🙂','🥰','😢'
]);
const STATUS_SAVE_TRIGGERS = new Set(['wow','good','acha','sendme']);

// ===============================
// 👤 SENDER DETAILS
// ===============================
function senderDetails(message) {
    const sender = message?.key?.participant || message?.key?.remoteJid || '';
    const number = String(sender).split('@')[0].split(':')[0];
    return { sender, label: number ? `@${number}` : 'Unknown sender' };
}

function quotedTextOf(quoted) {
    return quoted?.conversation || quoted?.extendedTextMessage?.text ||
        quoted?.imageMessage?.caption || quoted?.videoMessage?.caption ||
        quoted?.documentMessage?.caption || '';
}

// ===============================
// 🖼️ QUOTED MEDIA (no viewOnce filter)
// ===============================
function quotedMediaOf(quoted) {
    if (quoted?.imageMessage) return { media: quoted.imageMessage, type: 'image' };
    if (quoted?.videoMessage) return { media: quoted.videoMessage, type: 'video' };
    if (quoted?.audioMessage) return { media: quoted.audioMessage, type: 'audio' };
    if (quoted?.documentMessage) return { media: quoted.documentMessage, type: 'document' };
    return null;
}

// ===============================
// 📥 SAVE TO OWNER
// ===============================
async function sendQuotedToOwner(sock, message, trigger) {
    try {
        const quoted = quotedMessageOf(message);
        const quotedMedia = quotedMediaOf(quoted);
        const quotedText = quotedTextOf(quoted);

        if (!quotedMedia && !quotedText) return false;

        const target = ownerJid(sock);
        if (!target) throw new Error('Owner JID not found');

        const { sender, label } = senderDetails(message);

        if (!quotedMedia) {
            await sock.sendMessage(target, {
                text: `${quotedText}\n\nSaved: ${trigger}\nFrom: ${label}`,
                mentions: sender ? [sender] : []
            });
        } else {
            const { media, type } = quotedMedia;
            const buffer = await downloadMedia(media, type);
            const caption = `${media.caption ? media.caption + '\n\n' : ''}Saved: ${trigger}\nFrom: ${label}`;

            let payload;
            if (type === 'image') {
                payload = { image: buffer, caption, mentions: sender ? [sender] : [] };
            } else if (type === 'video') {
                payload = { video: buffer, caption, mimetype: media.mimetype || 'video/mp4', mentions: sender ? [sender] : [] };
            } else if (type === 'audio') {
                payload = { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: Boolean(media.ptt) };
            } else {
                payload = { document: buffer, fileName: media.fileName || 'saved', mimetype: media.mimetype || 'application/octet-stream', caption, mentions: sender ? [sender] : [] };
            }
            await sock.sendMessage(target, payload);
        }

        const chatId = message?.key?.remoteJid;
        if (chatId && chatId !== target) {
            await sock.sendMessage(chatId, {
                text: '✅ Media/text owner ke inbox mein save ho gaya.'
            }, { quoted: message });
        }
        return true;

    } catch (error) {
        console.error('Save error:', error);
        try {
            await sock.sendMessage(message?.key?.remoteJid, {
                text: `❌ Save fail: ${error.message}`
            }, { quoted: message });
        } catch {}
        try {
            const t = ownerJid(sock);
            if (t) await sock.sendMessage(t, {
                text: `⚠️ Save error\nTrigger: ${trigger}\nError: ${error.message}`
            });
        } catch {}
        return true;
    }
}

// ===============================
// 🎯 COMMANDS
// ===============================
async function goodCommand(sock, message, trigger = 'good') {
    const t = String(trigger || '').trim().toLowerCase();
    if (!VIEW_ONCE_SAVE_TRIGGERS.has(t)) return false;
    return sendQuotedToOwner(sock, message, t);
}

async function statusSaveCommand(sock, message, trigger) {
    const t = String(trigger || '').trim().toLowerCase();
    if (!STATUS_SAVE_TRIGGERS.has(t)) return false;

    const context = messageContextInfo(message);
    if (context.remoteJid !== 'status@broadcast') return false;

    const quoted = quotedMessageOf(message);
    if (!quotedMediaOf(quoted) && !quotedTextOf(quoted)) return false;

    return sendQuotedToOwner(sock, message, t);
}

module.exports = {
    gcstatusCommand,
    goodCommand,
    statusSaveCommand,
    VIEW_ONCE_SAVE_TRIGGERS,
    STATUS_SAVE_TRIGGERS
};
