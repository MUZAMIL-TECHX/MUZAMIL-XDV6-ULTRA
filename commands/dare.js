const axios = require('axios');
const { channelInfo, vipBox, react } = require('../lib/muzStyle');

async function dareCommand(sock, chatId, message) {
    try {
        await react(sock, message, '🎲');
        const res = await axios.get('https://apis.davidcyriltech.my.id/dare', { timeout: 15000 });
        const question = res.data?.question;
        if (!res.data?.success || !question) throw new Error('Bad API response');

        await sock.sendMessage(chatId, {
            text: vipBox('🎲 𝙳𝙰𝚁𝙴 𝚃𝙸𝙼𝙴', [`📝 𝙲𝚑𝚊𝚕𝚕𝚎𝚗𝚐𝚎 :\n${question}`]),
            ...channelInfo
        }, { quoted: message });
        await react(sock, message, '✅');
    } catch (err) {
        console.error('Dare Error:', err.message);
        await react(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', ['Dare fetch nahi hua, thodi der baad try karein.']),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { dareCommand };
