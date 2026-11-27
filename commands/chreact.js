const axios = require('axios');

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
// 🎯 .chreact COMMAND
// ===============================
async function chreactCommand(sock, chatId, message, args) {
    try {
        await addReaction(sock, message, '⏳');

        // Link nikaalo
        const link = (args || []).join(' ').trim();

        if (!link) {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: `
╭┈──〔 ❌ ɴᴏ ʟɪɴᴋ 〕┈──⊷
┋⋄ ➠ 📌 ᴜsᴀɢᴇ: .chreact <postlink>
┋⋄ ➠ 🔗 ᴇxᴀᴍᴘʟᴇ:
┋⋄ ➠ .chreact https://whatsapp.com/channel/xxx/123
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        }

        // Link validation
        if (!link.includes('whatsapp.com/channel/')) {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: `
╭┈──〔 ❌ ɪɴᴠᴀʟɪᴅ ʟɪɴᴋ 〕┈──⊷
┋⋄ ➠ 🔴 ʏᴇʜ ᴠᴀʟɪᴅ ᴄʜᴀɴɴᴇʟ ʟɪɴᴋ ɴᴀʜɪ ʜᴀɪ
┋⋄ ➠ 💡 ᴜsᴇ: https://whatsapp.com/channel/xxx/123
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        }

        // API call
        await addReaction(sock, message, '📡');

        const apiUrl = `https://muzamil-react-api.vercel.app/react?link=${encodeURIComponent(link)}`;
        console.log('Calling API:', apiUrl);

        const response = await axios.get(apiUrl, {
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const data = response.data || {};
        console.log('API Response:', JSON.stringify(data));

        if (data.Status && String(data.Status).toLowerCase().includes('done')) {
            await addReaction(sock, message, '✅');
            return sock.sendMessage(chatId, {
                text: `
╭┈──〔 ✅ ʀᴇᴀᴄᴛ sᴇɴᴛ 〕┈──⊷
┋⋄ ➠ 🎯 sᴛᴀᴛᴜs: ${data.Status}
┋⋄ ➠ 👤 ᴄʀᴇᴀᴛᴏʀ: ${data.Creator || 'N/A'}
┋⋄ ➠ 📞 ᴄᴏɴᴛᴀᴄᴛ: ${data.Contact || 'N/A'}
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        } else {
            await addReaction(sock, message, '❌');
            return sock.sendMessage(chatId, {
                text: `
╭┈──〔 ⚠️ ɴᴏ sᴛᴀᴛᴜs 〕┈──⊷
┋⋄ ➠ 🔴 API ɴᴇ "done" ɴᴀʜɪ ʙʜᴇᴊᴀ
┋⋄ ➠ 📋 ʀᴇsᴘᴏɴsᴇ: ${JSON.stringify(data).slice(0, 300)}
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
                ...channelInfo
            }, { quoted: message });
        }

    } catch (error) {
        console.error('chreact error:', error);

        let errorMsg = error.message || 'Something went wrong';
        if (error.response) {
            errorMsg = `API returned ${error.response.status}: ${JSON.stringify(error.response.data).slice(0, 200)}`;
        } else if (error.code === 'ECONNABORTED') {
            errorMsg = 'Request timeout (30s) — API slow hai ya down hai';
        } else if (error.code === 'ENOTFOUND') {
            errorMsg = 'API host resolve nahi hua — internet check karein';
        }

        await addReaction(sock, message, '❌');
        return sock.sendMessage(chatId, {
            text: `
╭┈──〔 ❌ ᴇʀʀᴏʀ 〕┈──⊷
┋⋄ ➠ 🔴 ${errorMsg}
┋⋄ ➠ 💡 ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ
╰─────────────────────⊷

      𝗕𝘆 : 𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫`,
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = {
    name: 'chreact',
    description: 'React to a WhatsApp channel post',
    command: chreactCommand,
    handler: chreactCommand,
    execute: chreactCommand,
    chreactCommand,
    addReaction
};
