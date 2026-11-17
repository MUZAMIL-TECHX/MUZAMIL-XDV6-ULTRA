const axios = require('axios');

// ═══════════════════════════════════════════════════════════
//                    🧠 LLAMA AI CONFIG
// ═══════════════════════════════════════════════════════════
const API_URL = process.env.LLAMA_API_URL || 'https://llama.gtech-apiz.workers.dev/';
const getApiKey = () => String(process.env.LLAMA_API_KEY || 'Suhail').trim();

function extractText(body) {
    if (typeof body === 'string') return body;
    if (!body || typeof body !== 'object') return '';
    const candidates = [
        body.response, body.data?.response, body.data?.choices?.[0]?.message?.content,
        body.choices?.[0]?.message?.content, body.result, body.text, body.answer,
        body.reply, body.message, body.data, body.data?.result, body.data?.text,
        body.data?.answer, body.data?.reply
    ];
    const value = candidates.find(item => item !== undefined && item !== null);
    return typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
}

async function askLlama(text) {
    const response = await axios.get(API_URL, {
        params: { apikey: getApiKey(), text: String(text || '') },
        timeout: 20000, maxContentLength: 1024 * 1024
    });
    if (response.data?.status === false) throw new Error('Llama API failed');
    return extractText(response.data).trim();
}

// ═══════════════════════════════════════════════════════════
//                    💘 LOVE TEST COMMAND
// ═══════════════════════════════════════════════════════════
module.exports = async (sock, chatId, message) => {
    const channelInfo = {
        contextInfo: {
            forwardingScore: 999, isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "120363426106687970@newsletter",
                newsletterName: "𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫", serverMessageId: 200
            }
        }
    };

    const sendMsg = async (text, mentions = []) => {
        return await sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });
    };

    try {
        const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length < 2) {
            return await sendMsg("⚠️ *Usage:* .lovetest @user1 @user2\n(Kisi 2 users ko mention karein)");
        }

        await sock.sendMessage(chatId, { react: { text: '❤️', key: message.key } });

        const user1 = `@${mentioned[0].split("@")[0]}`;
        const user2 = `@${mentioned[1].split("@")[0]}`;

        // Random Percentage (10 se 100 tak)
        const finalPercent = Math.floor(Math.random() * 10 + 1) * 10; 

        // AI ko clear instructions de rahe hain Roman Urdu ke liye
        const prompt = `inke love percentage dekh ke inko kuchh bolo funny line roman urdu me emoji bhe use krna .\n\nLove Percentage: ${finalPercent}%\nNames: ${user1} and ${user2}`;

        let funnyDialogue;
        try {
            funnyDialogue = await askLlama(prompt);
        } catch (aiError) {
            console.error("AI failed:", aiError.message);
            funnyDialogue = "Api down hai bhai, thori der baad try karo 😂";
        }

        // Ultra VIP Design
        const replyText = `┏━━━━━━━━━━━━━━━━━━━┓\n` +
                          `┃   💘 *Lᴏᴠᴇ Tᴇsᴛ* 💘\n` +
                          `┗━━━━━━━━━━━━━━━━━━━┛\n\n` +
                          `👤 *User 1:* ${user1}\n` +
                          `👤 *User 2:* ${user2}\n\n` +
                          `📊 *Result:* ${finalPercent}%\n\n` +
                          `❤️ *Aapki Love:* ${finalPercent}% Hai\n\n` +
                          `*😂😝:*\n` +
                          `\`${funnyDialogue}\`\n\n` +
                          `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
                          `   ⚡ *By : Muzamil-XD* ⚡`;

        await sendMsg(replyText, mentioned);
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error("Love Test Error:", err.message);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sendMsg("⚠️ *Error:* Love test nahi ho paya. Thodi der baad try karein.");
    }
};
