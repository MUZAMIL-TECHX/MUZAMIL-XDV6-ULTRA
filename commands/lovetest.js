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

// Helper to get real name from group
async function getName(sock, jid, chatId) {
    let name = jid.split('@')[0];
    try {
        if (chatId.endsWith('@g.us')) {
            const metadata = await sock.groupMetadata(chatId);
            const participant = metadata.participants.find(p => p.id === jid);
            if (participant && participant.name) {
                name = participant.name;
            }
        }
    } catch (e) {
        console.error("Name fetch error:", e.message);
    }
    return name;
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

        // IDs for tagging
        const tag1 = `@${mentioned[0].split("@")[0]}`;
        const tag2 = `@${mentioned[1].split("@")[0]}`;

        // Real Names for AI text
        const name1 = await getName(sock, mentioned[0], chatId);
        const name2 = await getName(sock, mentioned[1], chatId);

        const finalPercent = Math.floor(Math.random() * 10 + 1) * 10; 

        // Prompt for AI (No @ symbol, only names)
        const prompt = `You are a funny friend. Inke love percentage dekh ke inko kuchh funny line roman urdu me bolo. Use 1-2 emojis.\n\nNames: ${name1} and ${name2}\nLove Percentage: ${finalPercent}%\n\nDo NOT use @ symbol. Just write their names.`;

        let funnyDialogue;
        try {
            funnyDialogue = await askLlama(prompt);
            // Safety: Remove any @ if AI adds it
            funnyDialogue = funnyDialogue.replace(/@/g, '').trim();
        } catch (aiError) {
            console.error("AI failed:", aiError.message);
            funnyDialogue = "Api down hai bhai, thori der baad try karo 😂";
        }

        // VIP Design
        const replyText = `┏━━━━━━━━━━━━━━━━━━━┓\n` +
                          `┃   💘 *ʟᴏᴠᴇ ᴛᴇsᴛ* 💘\n` +
                          `┗━━━━━━━━━━━━━━━━━━━┛\n\n` +
                          `👤 *ᴜsᴇʀ 1:* ${tag1}\n` + // Tag for notification
                          `👤 *ᴜsᴇʀ 2:* ${tag2}\n\n` + // Tag for notification
                          `📊 *ʀᴇsᴜʟᴛ:* ${finalPercent}%\n\n` +
                          `❤️ *ᴀᴀᴘᴋɪ ʟᴏᴠᴇ:* ${finalPercent}% ʜᴀɪ\n\n` +
                          `*😂😝:*\n` +
                          `\`${funnyDialogue}\`\n\n` +
                          `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
                          `   ⚡ *ʙʏ : ᴍᴜᴢᴀᴍɪʟ-xᴅ* ⚡`;

        await sendMsg(replyText, mentioned);
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error("Love Test Error:", err.message);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sendMsg("⚠️ *ᴇʀʀᴏʀ:* ʟᴏᴠᴇ ᴛᴇsᴛ ɴᴀʜɪ ʜᴏ ᴘᴀʏᴀ. ᴛʜᴏᴅɪ ᴅᴇʀ ʙᴀᴀᴅ ᴛʀʏ ᴋᴀʀᴇɪɴ.");
    }
};
