'use strict';
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../lib/store'); // Make sure path is correct

module.exports = async (sock, chatId, message) => {
    try {
        const contextInfo = message.message?.extendedTextMessage?.contextInfo;
        const quoted = contextInfo?.quotedMessage;
        
        if (!quoted) {
            return await sock.sendMessage(chatId, { text: '🍁 Please reply to a view once message!' }, { quoted: message });
        }

        // ViewOnce detect karo
        const isViewOnce = quoted.viewOnce === true || 
                           !!quoted.viewOnceMessage || 
                           !!quoted.viewOnceMessageV2 || 
                           !!quoted.viewOnceMessageV2Extension || 
                           !!quoted.imageMessage || 
                           !!quoted.videoMessage || 
                           !!quoted.audioMessage;

        if (!isViewOnce) {
            return await sock.sendMessage(chatId, { text: '🍁 Please reply to a view once message!' }, { quoted: message });
        }

        // React lagao
        await sock.sendMessage(chatId, { react: { text: '🐳', key: message.key } });

        let buffer = null;
        let fetchError = "Unknown error";

        // ✅ TARIKA 1: Store se original message nikaalo (Qadeer ka asli tarika)
        try {
            const quotedMsgId = contextInfo?.stanzaId;
            if (quotedMsgId) {
                console.log('[VV2] Checking Store for ID:', quotedMsgId);
                const original = await store.loadMessage(quotedMsgId);
                if (original && original.message) {
                    console.log('[VV2] Store Hit! Downloading...');
                    buffer = await downloadMediaMessage({ key: original.key, message: original.message }, 'buffer', {});
                }
            }
        } catch (e) { 
            console.log('[VV2] Store download failed:', e.message);
            fetchError = e.message; 
        }

        // ✅ TARIKA 2: Agar store fail ho, toh quoted.download try karo
        if (!buffer) {
            try {
                if (typeof quoted.download === 'function') {
                    console.log('[VV2] Trying quoted.download()...');
                    buffer = await quoted.download();
                }
            } catch (e) { 
                console.log('[VV2] quoted.download failed:', e.message);
                fetchError = e.message; 
            }
        }

        // ✅ TARIKA 3: Direct fallback
        if (!buffer) {
            try {
                console.log('[VV2] Trying fallback...');
                const source = quoted.message ? { key: message.key, message: quoted.message } : { key: message.key, message: quoted };
                buffer = await downloadMediaMessage(source, 'buffer', {});
            } catch (e) { 
                fetchError = e.message; 
            }
        }

        // Agar sab fail ho jayein
        if (!buffer || buffer.length === 0) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return await sock.sendMessage(chatId, { 
                text: `❌ *Recovery failed*\n\n_${fetchError}_` 
            }, { quoted: message });
        }

        // Media Type check karo
        let mediaType = 'imageMessage';
        const mime = String(quoted.mimetype || (quoted.message && quoted.message.mimetype) || '');
        if (mime.startsWith('video/')) mediaType = 'videoMessage';
        else if (mime.startsWith('audio/')) mediaType = 'audioMessage';

        // Inbox mein bhejo
        const inboxJid = message.key.participant || chatId;
        const inboxNote = `\n\n_From: ${chatId}_`;
        
        const payload = {
            ...(mediaType === 'imageMessage' ? {
                image: buffer,
                caption: (quoted.caption || '') + inboxNote,
                mimetype: quoted.mimetype || 'image/jpeg'
            } : mediaType === 'videoMessage' ? {
                video: buffer,
                caption: (quoted.caption || '') + inboxNote,
                mimetype: quoted.mimetype || 'video/mp4'
            } : {
                audio: buffer,
                mimetype: 'audio/mp4',
                ptt: !!quoted.ptt
            })
        };

        await sock.sendMessage(inboxJid, payload);
        await sock.sendMessage(chatId, { text: '✅ *View-once media sent to inbox.*' }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('[VV2] error:', error);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `❌ *Recovery failed*\n\n_${error.message}_` }, { quoted: message });
    }
};
