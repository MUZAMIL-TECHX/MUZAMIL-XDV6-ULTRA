const {
    downloadContentFromMessage,
    generateWAMessageContent,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const isOwnerOrSudo = require('../lib/isOwner');

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

async function addReaction(sock, message, emoji) {
    try {
        await sock.sendMessage(message.key.remoteJid, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        console.error('Reaction error:', error);
    }
}

const WRAPPER_KEYS = [
    'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension',
    'groupStatusMessageV2', 'groupStatusMessage', 'documentWithCaptionMessage'
];
const GROUP_STATUS_KEYS = ['groupStatusMessageV2', 'groupStatusMessage'];

function unwrapMessage(message) {
    let current = message;
    for (let i = 0; i < 8 && current; i++) {
        const key = WRAPPER_KEYS.find(k => current[k]?.message);
        if (!key) break;
        current = current[key].message;
    }
    return current || {};
}

// True when the (raw) quoted message is a WhatsApp *group status* post
function isGroupStatusQuote(rawQuoted) {
    let current = rawQuoted;
    for (let i = 0; i < 8 && current; i++) {
        if (GROUP_STATUS_KEYS.some(k => current[k])) return true;
        const key = WRAPPER_KEYS.find(k => current[k]?.message);
        if (!key) return false;
        current = current[key].message;
    }
    return false;
}

function quotedMessageOf(message) {
    const contextInfo =
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.imageMessage?.contextInfo ||
        message?.message?.videoMessage?.contextInfo ||
        message?.message?.audioMessage?.contextInfo ||
        message?.message?.documentMessage?.contextInfo ||
        {};
    return unwrapMessage(contextInfo.quotedMessage);
}

function messageContextInfo(message) {
    return (
        message?.message?.extendedTextMessage?.contextInfo ||
        message?.message?.imageMessage?.contextInfo ||
        message?.message?.videoMessage?.contextInfo ||
        message?.message?.audioMessage?.contextInfo ||
        message?.message?.documentMessage?.contextInfo ||
        {}
    );
}

// ✅ ULTRA DOWNLOAD MEDIA FUNCTION (Qadeer's _msgStore + quoted.download)
async function downloadMedia(sock, message, media, type) {
    try {
        // 1. Try Qadeer's custom download (Agar quoted object mein available ho)
        const quoted = quotedMessageOf(message);
        if (quoted && typeof quoted.download === 'function') {
            console.log('[GCSTATUS] Trying quoted.download()...');
            return await quoted.download();
        }

        // 2. Try Qadeer's Message Store (_msgStore)
        console.log('[GCSTATUS] Trying _msgStore...');
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
                const origEx = unwrapMessage(original.message);
                const innerMedia = origEx[type + 'Message']; // imageMessage, videoMessage, etc.
                
                if (innerMedia && innerMedia.mediaKey) {
                    console.log('[GCSTATUS] Store hit! Downloading from store...');
                    const stream = await downloadContentFromMessage(innerMedia, type);
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    return Buffer.concat(chunks);
                }
            }
        }

        // 3. Fallback: Normal download
        console.log('[GCSTATUS] Fallback to standard download...');
        const stream = await downloadContentFromMessage(media, type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);

    } catch (error) {
        console.error('[GCSTATUS] Download media error:', error.message);
        return null;
    }
}

function ownerJid(sock) {
    const connected = String(sock?.user?.id || sock?.user?.jid || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/[^\d]/g, '');
    return connected ? `${connected}@s.whatsapp.net` : null;
}

async function uploadToWA(sock, buffer, type) {
    if (typeof sock.waUploadToServer === 'function') {
        return await sock.waUploadToServer(buffer, type);
    }
    if (sock?.mediaUploader?.upload) {
        return await sock.mediaUploader.upload(buffer, type);
    }
    throw new Error('Media uploader not available');
}

async function sendGroupStatus(sock, groupJid, content) {
    if (!groupJid?.endsWith('@g.us')) {
        throw new Error('This command can only be used in a group.');
    }

    const uploadedContent = { ...content };

    if (content.image) {
        const up = await uploadToWA(sock, content.image, 'image');
        uploadedContent.image = up.url || up;
        delete content.image;
    }
    if (content.video) {
        const up = await uploadToWA(sock, content.video, 'video');
        uploadedContent.video = up.url || up;
        delete content.video;
    }
    if (content.audio) {
        const up = await uploadToWA(sock, content.audio, 'audio');
        uploadedContent.audio = up.url || up;
        delete content.audio;
    }
    if (content.document) {
        const up = await uploadToWA(sock, content.document, 'document');
        uploadedContent.document = up.url || up;
        delete content.document;
    }

    const messageSecret = crypto.randomBytes(32);
    const innerMessage = await generateWAMessageContent(uploadedContent, {
        upload: (buf, type) => uploadToWA(sock, buf, type)
    });

    const wrapped = generateWAMessageFromContent(groupJid, {
        messageContextInfo: { messageSecret },
        groupStatusMessageV2: {
            message: {
                ...innerMessage,
                messageContextInfo: { messageSecret }
            }
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
            await sock.sendMessage(chatId, {
                text: `╭┈──〔 ❌ ɢʀᴏᴜᴘ ᴏɴʟʏ 〕┈──⊷\n┋⋄ ➠ 🔴 ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ꜰᴏʀ ɢʀᴏᴜᴘs ᴏɴʟʏ\n╰─────────────────────⊷\n\n      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        const quoted = quotedMessageOf(message);
        const quotedText = quoted.conversation ||
            quoted.extendedTextMessage?.text ||
            quoted.imageMessage?.caption ||
            quoted.videoMessage?.caption ||
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
                text: `╭┈──〔 ❌ ɴᴏ ʀᴇᴘʟʏ 〕┈──⊷\n┋⋄ ➠ 📌 ʀᴇᴘʟʏ ᴛᴏ ᴀɴʏ ᴍᴇᴅɪᴀ ᴏʀ ᴛᴇxᴛ\n╰─────────────────────⊷\n\n      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        let statusContent;
        try {
            if (quoted.imageMessage) {
                const buffer = await downloadMedia(sock, message, quoted.imageMessage, 'image');
                if (!buffer) throw new Error('Failed to download image');
                statusContent = { image: buffer, caption: quoted.imageMessage.caption || undefined };
            } else if (quoted.videoMessage) {
                const buffer = await downloadMedia(sock, message, quoted.videoMessage, 'video');
                if (!buffer) throw new Error('Failed to download video');
                statusContent = { video: buffer, caption: quoted.videoMessage.caption || undefined, mimetype: quoted.videoMessage.mimetype || 'video/mp4' };
            } else if (quoted.audioMessage) {
                const buffer = await downloadMedia(sock, message, quoted.audioMessage, 'audio');
                if (!buffer) throw new Error('Failed to download audio');
                statusContent = { audio: buffer, mimetype: quoted.audioMessage.mimetype || 'audio/mpeg', ptt: Boolean(quoted.audioMessage.ptt) };
            } else if (quoted.documentMessage) {
                const buffer = await downloadMedia(sock, message, quoted.documentMessage, 'document');
                if (!buffer) throw new Error('Failed to download document');
                statusContent = { document: buffer, mimetype: quoted.documentMessage.mimetype || 'application/octet-stream', fileName: quoted.documentMessage.fileName || 'status-file' };
            } else {
                statusContent = { text: quotedText || directText };
            }
        } catch (downloadError) {
            await addReaction(sock, message, '❌');
            await sock.sendMessage(chatId, {
                text: `╭┈──〔 ❌ ᴅᴏᴡɴʟᴏᴀᴅ ꜰᴀɪʟᴇᴅ 〕┈──⊷\n┋⋄ ➠ 🔴 ${downloadError.message || 'Could not download media'}\n╰─────────────────────⊷\n\n      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
            return;
        }

        try {
            await sendGroupStatus(sock, chatId, statusContent);
            await addReaction(sock, message, '✅');
            await sock.sendMessage(chatId, {
                text: `╭┈──〔 ✅ sᴛᴀᴛᴜs ᴘᴏsᴛᴇᴅ 〕┈──⊷\n┋⋄ ➠ 📡 ᴘᴏsᴛᴇᴅ ᴛᴏ ɢʀᴏᴜᴘ sᴛᴀᴛᴜs\n╰─────────────────────⊷\n\n      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        } catch (sendError) {
            await addReaction(sock, message, '❌');
            await sock.sendMessage(chatId, {
                text: `╭┈──〔 ❌ ᴘᴏsᴛ ꜰᴀɪʟᴇᴅ 〕┈──⊷\n┋⋄ ➠ 🔴 ${sendError.message || 'Could not post'}\n╰─────────────────────⊷\n\n      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        }

    } catch (error) {
        console.error('GCStatus error:', error);
        await addReaction(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: `╭┈──〔 ❌ ᴇʀʀᴏʀ 〕┈──⊷\n┋⋄ ➠ 🔴 ${error.message || 'Something went wrong'}\n╰─────────────────────⊷\n\n      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
            ...channelInfo
        }, { quoted: message });
    }
}

// ===============================
// 🕵️ VIEW-ONCE SAVE LOGIC
// ===============================
const VIEW_ONCE_SAVE_TRIGGERS = new Set([
    'good', 'cute', 'mashallah', 'wow', 'sosad', 'hehe', '🙂', '🥰', '😢'
]);

const STATUS_SAVE_TRIGGERS = new Set([
    'ok', 'wow', 'good', 'acha', 'sendme'
]);

function senderDetails(message) {
    const sender = message?.key?.participant || message?.key?.remoteJid || '';
    const number = String(sender).split('@')[0].split(':')[0];
    return { sender, label: number ? `@${number}` : 'Unknown sender' };
}

function quotedTextOf(quoted) {
    return quoted?.conversation ||
        quoted?.extendedTextMessage?.text ||
        quoted?.imageMessage?.caption ||
        quoted?.videoMessage?.caption ||
        quoted?.documentMessage?.caption ||
        '';
}

function quotedMediaOf(quoted) {
    if (quoted?.imageMessage) return { media: quoted.imageMessage, type: 'image' };
    if (quoted?.videoMessage) return { media: quoted.videoMessage, type: 'video' };
    if (quoted?.audioMessage) return { media: quoted.audioMessage, type: 'audio' };
    if (quoted?.documentMessage) return { media: quoted.documentMessage, type: 'document' };
    return null;
}

async function sendQuotedToOwner(sock, message, trigger, { requireViewOnce = false } = {}) {
    try {
        const quoted = quotedMessageOf(message);
        const quotedMedia = quotedMediaOf(quoted);
        const quotedText = quotedTextOf(quoted);
        
        if (!quotedMedia && (!quotedText || requireViewOnce)) return false;
        
        // ViewOnce Check
        if (requireViewOnce) {
            const isViewOnce = quotedMedia?.media?.viewOnce || 
                               quoted?.viewOnceMessage || 
                               quoted?.viewOnceMessageV2 || 
                               quoted?.viewOnceMessageV2Extension ||
                               message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2 ||
                               message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage;
            if (!isViewOnce) return false;
        }

        const target = ownerJid(sock);
        if (!target) return true;

        const { sender, label } = senderDetails(message);
        if (!quotedMedia) {
            await sock.sendMessage(target, {
                text: `${quotedText}\n\nSaved by reply: ${trigger}\nFrom: ${label}`,
                mentions: sender ? [sender] : []
            });
            return true;
        }

        const { media, type } = quotedMedia;
        
        // ✅ Yahan sock aur message pass kar rahe hain Qadeer store ke liye
        const buffer = await downloadMedia(sock, message, media, type);
        
        if (!buffer) return true;

        const caption = `${media.caption ? `${media.caption}\n\n` : ''}Saved by reply: ${trigger}\nFrom: ${label}`;
        let payload;

        if (type === 'image') {
            payload = { image: buffer, caption, mentions: sender ? [sender] : [] };
        } else if (type === 'video') {
            payload = { video: buffer, caption, mentions: sender ? [sender] : [], mimetype: media.mimetype || 'video/mp4' };
        } else if (type === 'audio') {
            payload = { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: Boolean(media.ptt) };
        } else {
            payload = { document: buffer, fileName: media.fileName || 'saved-media', mimetype: media.mimetype || 'application/octet-stream', caption, mentions: sender ? [sender] : [] };
        }

        await sock.sendMessage(target, payload);
        return true;
    } catch (error) {
        console.error('Owner media save error:', error);
        return false;
    }
}

async function goodCommand(sock, message, trigger = 'good') {
    const normalizedTrigger = String(trigger || '').trim().toLowerCase();
    if (!VIEW_ONCE_SAVE_TRIGGERS.has(normalizedTrigger)) return false;
    return sendQuotedToOwner(sock, message, normalizedTrigger, { requireViewOnce: true });
}

async function statusSaveCommand(sock, message, trigger) {
    const normalizedTrigger = String(trigger || '').trim().toLowerCase();
    if (!STATUS_SAVE_TRIGGERS.has(normalizedTrigger)) return false;
    const context = messageContextInfo(message);

    // 1) Normal status reply (status@broadcast)   2) Group status reply (inside a group)
    const isStatus = context.remoteJid === 'status@broadcast';
    const isGroupStatus = String(message?.key?.remoteJid || '').endsWith('@g.us')
        && isGroupStatusQuote(context.quotedMessage);
    if (!isStatus && !isGroupStatus) return false;

    // Group status: only the connected account / owner / sudo may save
    if (isGroupStatus && !message.key.fromMe) {
        const senderId = message.key.participant || message.key.remoteJid;
        if (!(await isOwnerOrSudo(senderId, sock, message.key.remoteJid))) return false;
    }

    const quoted = quotedMessageOf(message);
    if (!quotedMediaOf(quoted) && !quotedTextOf(quoted)) return false;
    return sendQuotedToOwner(sock, message, normalizedTrigger);
}

module.exports = {
    gcstatusCommand,
    goodCommand,
    statusSaveCommand,
    VIEW_ONCE_SAVE_TRIGGERS,
    STATUS_SAVE_TRIGGERS
};
