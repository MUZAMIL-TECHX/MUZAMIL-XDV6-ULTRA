/**
 * .vv2 — View-Once Recovery Command
 * Optimized for @whiskeysockets/baileys (QadeerXTech fork)
 *
 * Flow:
 *   1) store.loadMessage(stanzaId) → original full message (media keys intact) → download
 *   2) Fallback: direct download from quoted context (agar media key mili ho)
 *
 * Note: store 15-min TTL / 350 msg limit rakhta hai (lib/store.js),
 * isliye reply jaldi karein.
 */
'use strict';
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../lib/store'); // Make sure path is correct

// ── View-once / ephemeral wrappers unwrap karo (Baileys proto) ──
function unwrapMessage(content) {
    let current = content || {};
    for (let i = 0; i < 5; i++) {
        if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
        else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
        else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
        else if (current.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
        else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
        else break;
    }
    return current || {};
}

// ── Unwrapped content se media message nikaalo ──
function extractMedia(content) {
    const unwrapped = unwrapMessage(content);
    return unwrapped.imageMessage ||
           unwrapped.videoMessage ||
           unwrapped.audioMessage ||
           null;
}

// ── Media type detect karo ──
function getMediaType(content) {
    const unwrapped = unwrapMessage(content);
    if (unwrapped.imageMessage) return { type: 'image', media: unwrapped.imageMessage };
    if (unwrapped.videoMessage) return { type: 'video', media: unwrapped.videoMessage };
    if (unwrapped.audioMessage) return { type: 'audio', media: unwrapped.audioMessage };
    return { type: null, media: null };
}

module.exports = async (sock, chatId, message) => {
    try {
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quoted = contextInfo?.quotedMessage;

        if (!quoted) {
            return await sock.sendMessage(chatId, { text: '🍁 Please reply to a view once message!' }, { quoted: message });
        }

        // ── View-once detect karo (wrapper ya viewOnce flag) ──
        const hasVvWrapper = !!(quoted.viewOnceMessage ||
                                quoted.viewOnceMessageV2 ||
                                quoted.viewOnceMessageV2Extension);
        const { type: quotedType, media: quotedMedia } = getMediaType(quoted);
        const isViewOnce = hasVvWrapper || quotedMedia?.viewOnce === true;

        if (!isViewOnce) {
            return await sock.sendMessage(chatId, { text: '🍁 Please reply to a view once message!' }, { quoted: message });
        }

        // React lagao
        await sock.sendMessage(chatId, { react: { text: '🐳', key: message.key } });

        let buffer = null;
        let fetchError = 'Unknown error';
        const stanzaId = contextInfo?.stanzaId;

        // ✅ TARIKA 1: Store se original message nikaalo (media keys yahan intact hoti hain)
        try {
            if (stanzaId) {
                console.log('[VV2] Checking Store for ID:', stanzaId);
                const entry = await store.loadMessage(stanzaId);
                // entry = { id, jid, message: { key, message, messageTimestamp, pushName, sender }, timestamp }
                const originalMsg = entry?.message?.message;   // ← asli proto yahan hai
                const originalKey = entry?.message?.key;       // ← asli key yahan hai

                if (originalMsg && originalKey) {
                    const { type: origType, media: origMedia } = getMediaType(originalMsg);
                    if (origType && origMedia) {
                        console.log('[VV2] Store Hit! Downloading...');
                        buffer = await downloadMediaMessage(
                            { key: originalKey, message: unwrapMessage(originalMsg) },
                            'buffer',
                            {}
                        );
                    } else {
                        fetchError = 'Stored message has no media';
                    }
                } else {
                    fetchError = 'Message not found in store (15 min / 350 msg limit)';
                }
            }
        } catch (e) {
            console.log('[VV2] Store download failed:', e.message);
            fetchError = e.message;
        }

        // ✅ TARIKA 2: Direct fallback — quoted content se download karo
        if (!buffer && quotedType && quotedMedia) {
            try {
                console.log('[VV2] Trying direct quoted download...');
                const quotedKey = {
                    remoteJid: chatId,
                    id: stanzaId,
                    participant: contextInfo?.participant || undefined
                };
                buffer = await downloadMediaMessage(
                    { key: quotedKey, message: unwrapMessage(quoted) },
                    'buffer',
                    {}
                );
            } catch (e) {
                console.log('[VV2] Direct download failed:', e.message);
                fetchError = e.message;
            }
        }

        // Agar sab fail ho jayein
        if (!buffer || buffer.length === 0) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return await sock.sendMessage(chatId, {
                text: `❌ *Recovery failed*\n\n_${fetchError}_\n\n_Tip: Bot restart ke baad purane messages store mein nahi hote._`
            }, { quoted: message });
        }

        // ── Media info unwrapped quoted se lo ──
        const { type, media } = getMediaType(quoted);
        const mime = String(media?.mimetype || '');

        // Inbox mein bhejo
        const inboxJid = message.key.participant || chatId;
        const inboxNote = `\n\n_From: ${chatId}_`;

        const payload = type === 'image' ? {
            image: buffer,
            caption: (media?.caption || '') + inboxNote,
            mimetype: mime || 'image/jpeg'
        } : type === 'video' ? {
            video: buffer,
            caption: (media?.caption || '') + inboxNote,
            mimetype: mime || 'video/mp4'
        } : {
            audio: buffer,
            mimetype: mime || 'audio/mp4',
            ptt: !!media?.ptt
        };

        await sock.sendMessage(inboxJid, payload);
        await sock.sendMessage(chatId, { text: '✅ *View-once media sent to inbox.*' }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('[VV2] error:', error);
        try { await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } }); } catch (_) {}
        await sock.sendMessage(chatId, { text: `❌ *Recovery failed*\n\n_${error.message}_` }, { quoted: message });
    }
};
