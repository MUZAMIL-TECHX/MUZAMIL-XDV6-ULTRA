const { handleAntiBadwordCommand } = require('../lib/antibadword');
const isAdminHelper = require('../lib/isAdmin');

// VIP Channel Info
const channelInfo = {
    contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363426106687970@newsletter",
            newsletterName: "𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫",
            serverMessageId: 200
        }
    }
};

// Helper for VIP design
function box(title, lines = []) {
    let out = `┏━━━━━━━━━━━━━━━━━━━┓\n`;
    out += `┃   ${title}\n`;
    out += `┗━━━━━━━━━━━━━━━━━━━┛\n\n`;
    for (const l of lines) out += `  ▸ ${l}\n`;
    out += `\n┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
    out += `   ⚡ *By : Muzamil XD* ⚡`;
    return out;
}

async function antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        // 1. React ⚙️
        await sock.sendMessage(chatId, { react: { text: '⚙️', key: message.key } });

        // 2. Admin Check
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return await sock.sendMessage(chatId, {
                text: box('⛔ ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ', [
                    'ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ᴀɴ ᴀᴅᴍɪɴ!',
                    'ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴄᴀɴ ᴜsᴇ ᴛʜɪs.'
                ]),
                ...channelInfo
            }, { quoted: message });
        }

        // 3. Extract Command Arguments
        const text = message.message?.conversation ||
                    message.message?.extendedTextMessage?.text || '';
        const parts = text.trim().split(/\s+/);
        let match = parts.slice(1).join(' ').toLowerCase();
        
        if (/^\.antibadwordingset$/i.test(parts[0])) {
            match = `set ${parts.slice(1).join(' ')}`.trim().toLowerCase();
        }

        // 4. Handle the command (Pass to lib)
        await handleAntiBadwordCommand(sock, chatId, message, match);
        
        // 5. Success React ✅
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('Error in antibadword command:', error);
        
        // Error React ❌
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        
        await sock.sendMessage(chatId, {
            text: box('❌ ᴇʀʀᴏʀ', [
                'sᴏᴍᴇᴛʜɪɴɢ ᴡᴇɴᴛ ᴡʀᴏɴɢ.',
                'ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ.'
            ]),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = antibadwordCommand;
