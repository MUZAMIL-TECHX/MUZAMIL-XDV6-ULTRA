'use strict';
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../lib/store'); // Store connect kiya

// ViewOnce Unwrap Helper
const unwrapViewOnce = (msg) => {
    if (!msg) return null;
    const wrapper = msg.viewOnceMessageV2 || msg.viewOnceMessage || msg.viewOnceMessageV2Extension;
    if (wrapper) {
        const inner = wrapper.message || {};
        const type = Object.keys(inner)[0];
        return { type, content: inner[type] };
    }
    const type = Object.keys(msg).find(k => ['imageMessage', 'videoMessage', 'audioMessage'].includes(k));
    return type ? { type, content: msg[type] } : null;
};

async function withTimeout(promise, ms, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), ms); })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

module.exports = async (sock, chatId, message) => {
    try {
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quoted = contextInfo?.quotedMessage;
        
        if (!quoted) {
            return await sock.sendMessage(chatId, { text: '*🍁 Please reply to a view once message!*' }, { quoted: message });
        }

        const qmsg = quoted.message || quoted || {};
        const isViewOnce = qmsg.viewOnce === true || !!qmsg.viewOnceMessage || !!qmsg.viewOnceMessageV2 || !!qmsg.viewOnceMessageV2Extension || !!(quoted.imageMessage || quoted.videoMessage || quoted.audioMessage);
        
        if (!isViewOnce) {
            return await sock.sendMessage(chatId, { text: '*🍁 Please reply to a view once message!*' }, { quoted: message });
        }

        await sock.sendMessage(chatId, { react: { text: '🐳', key: message.key } });

        let buffer = null;
        let fetchError = null;

        // 1. Store se download karo
        try {
            const quotedMsgId = contextInfo?.stanzaId;
            if (quotedMsgId) {
                const original = await store.loadMessage(quotedMsgId);
                if (original && original.message) {
                    const origEx = unwrapViewOnce(original.message);
                    if (origEx?.content?.mediaKey) {
                        buffer = await withTimeout(
                            downloadMediaMessage({ key: original.key, message: original.message }, 'buffer', {}),
                            20000, 'store downloadMediaMessage'
                        );
                    }
                }
            }
        } catch (e) { fetchError = e.message; }

        // 2. quoted.download try karo
        if (!buffer) {
            try {
                if (typeof quoted.download === 'function') {
                    buffer = await withTimeout(quoted.download(), 20000, 'quoted.download()');
                }
            } catch (e) { fetchError = e.message; }
        }

        // 3. Fallback download
        if (!buffer) {
            try {
                const source = quoted.message ? { key: message.key, message: quoted.message } : { key: message.key, message: quoted };
                buffer = await withTimeout(downloadMediaMessage(source, 'buffer', {}), 20000, 'downloadMediaMessage');
            } catch (e) { fetchError = e.message; }
        }

        if (!buffer?.length) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return await sock.sendMessage(chatId, { text: `❌ *View-once recovery failed*\n\n_${fetchError || 'Media is no longer available'}_` }, { quoted: message });
        }

        // Media Type
        const unwrapped = unwrapViewOnce(qmsg);
        const mime = String(quoted.mimetype || qmsg.mimetype || unwrapped?.content?.mimetype || '');
        let mediaType = unwrapped?.type || null;
        if (!mediaType) {
            if (mime.startsWith('video/')) mediaType = 'videoMessage';
            else if (mime.startsWith('audio/')) mediaType = 'audioMessage';
            else mediaType = 'imageMessage';
        }
        const content = unwrapped?.content || quoted[mediaType] || qmsg[mediaType] || {};

        // Inbox
        const inboxJid = message.key.participant || chatId;
        const inboxNote = `\n\n_From: ${chatId}_`;
        
        const payload = {
            ...(mediaType === 'imageMessage' ? {
                image: buffer, caption: (content?.caption || '') + inboxNote, mimetype: content?.mimetype || 'image/jpeg'
            } : mediaType === 'videoMessage' ? {
                video: buffer, caption: (content?.caption || '') + inboxNote, mimetype: content?.mimetype || 'video/mp4'
            } : {
                audio: buffer, mimetype: 'audio/mp4', ptt: !!content?.ptt
            })
        };

        await sock.sendMessage(inboxJid, payload);
        await sock.sendMessage(chatId, { text: '✅ *View-once media sent to inbox.*' }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('[VV2] error:', error);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `❌ *View-once recovery failed*\n\n_${error.message}_` }, { quoted: message });
    }
};
