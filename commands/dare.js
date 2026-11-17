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
//                    🎲 DARE COMMAND
// ═══════════════════════════════════════════════════════════
module.exports = async (sock, chatId, message) => {
    
    // Ultra VIP Channel Info
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

    const sendMsg = async (text, mentions = []) => {
        return await sock.sendMessage(chatId, { text, mentions, ...channelInfo }, { quoted: message });
    };

    try {
        // 1. Check target user
        const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
        const target = mentioned[0] || quotedParticipant;

        if (!target) {
            return await sendMsg("⚠️ *Usage:* .dare @user\n(Kisi ko mention ya reply karein)");
        }

        // 2. Initial Reaction
        await sock.sendMessage(chatId, { react: { text: '🎲', key: message.key } });

        // 3. Fetch Dare from Shizo API
        const apiUrl = "https://shizoapi.onrender.com/api/texts/dare?apikey=shizo";
        const res = await axios.get(apiUrl, { timeout: 15000 });
        
        // Shizo API response check
        if (!res.data || !res.data.result) {
            throw new Error("Shizo API se dare nahi mila");
        }
        
        const rawDare = res.data.result;

        // 4. AI Translation & Funny Mode
        const prompt = `You are a savage and funny Pakistani friend. Translate this English dare into very funny, mazedaar Roman Urdu. Keep it short and add 1 funny emoji at the end. Just give the text, no extra words.\n\nDare: "${rawDare}"`;
        
        let finalDare;
        try {
            finalDare = await askLlama(prompt);
        } catch (aiError) {
            console.error("AI failed, using raw:", aiError.message);
            finalDare = rawDare; 
        }

        // 5. Ultra VIP Final Message Design
        const replyText = `┏━━━━━━━━━━━━━━━━━━━┓\n` +
                          `┃   🎲 *ᴅᴀʀᴇ ᴛɪᴍᴇ* 🎲\n` +
                          `┗━━━━━━━━━━━━━━━━━━━┛\n\n` +
                          `👤 *Target:* @${target.split("@")[0]}\n` +
                          `📝 *Challenge:* \n\n` +
                          `┌───────────────────\n` +
                          `│ ${finalDare}\n` +
                          `└───────────────────\n\n` +
                          `┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n` +
                          `   ⚡ *By : Muzamil XD* ⚡`;

        // 6. Send
        await sendMsg(replyText, [target]);
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        console.error("Dare Error:", err.message);
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sendMsg("⚠️ *Error:* Dare fetch karne mein masla hua. Thodi der baad try karein.");
    }
};
