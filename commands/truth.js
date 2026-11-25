const axios = require('axios');
const { channelInfo, vipBox, react } = require('../lib/muzStyle');

// .truth aur .trust dono isi se chalte hain
async function truthCommand(sock, chatId, message) {
    try {
        await react(sock, message, '🧠');
        const res = await axios.get('https://apis.davidcyriltech.my.id/truth', { timeout: 15000 });
        const question = res.data?.question;
        if (!res.data?.success || !question) throw new Error('Bad API response');

        await sock.sendMessage(chatId, {
            text: vipBox('🧠 𝚃𝚁𝚄𝚃𝙷 𝚃𝙸𝙼𝙴', [`❓ 𝚀𝚞𝚎𝚜𝚝𝚒𝚘𝚗 :\n${question}`]),
            ...channelInfo
        }, { quoted: message });
        await react(sock, message, '✅');
    } catch (err) {
        console.error('Truth Error:', err.message);
        await react(sock, message, '❌');
        await sock.sendMessage(chatId, {
            text: vipBox('❌ 𝙴𝚁𝚁𝙾𝚁', ['Truth fetch nahi hua, thodi der baad try karein.']),
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { truthCommand };
