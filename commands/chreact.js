'use strict';

/**
 * .chreact / .autoreact (channel link) — MUZAMIL-XD
 *
 *   .chreact <post link> [count] [emojis]            -> single post reactions
 *   .chreact random <post link> [count]              -> random 6 emojis
 *   .chreact weekly|auto <channel link> [count] [e]  -> 7-day auto reactions
 *   .chreact status <channel link or ID>             -> weekly status
 *   .autoreact <channel link> [count] [emojis]       -> same as weekly
 *
 * API contract:
 *   POST /api/react/single  { url, count, emojis }
 *   POST /api/react/weekly  { url, count, emojis }
 *   GET  /api/react/weekly/:channelCode
 */

// NOTE: base must be the site origin (not /react.html), endpoints are appended to it.
const API_BASE = (process.env.CHREACT_API_BASE || 'https://maliya-md.vercel.app').replace(/\/+$/, '');
const MAX_COUNT = 3500;
const MAX_EMOJIS = 10;
const BOT_NAME = '𝑀𝑼𝑍𝜦𝑀𝜤𝐋-𝑿𝑫';
const NEWSLETTER_JID = '120363426106687970@newsletter';

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: NEWSLETTER_JID,
            newsletterName: BOT_NAME,
            serverMessageId: -1
        }
    }
};

const EMOJI_LIST = [
    '👍', '❤️', '😂', '😮', '😢',
    '🙏', '🔥', '🎉', '😍', '👏',
    '💯', '🤩', '🥳', '🥰', '😎',
    '💥', '✨', '🚀', '👑', '💖'
];
const EMOJI_SET = new Set(EMOJI_LIST);

function box(title, lines = []) {
    let out = `╭━━━━━━━━━━━━━━━━━━╮\n┃  ✦ ${title}\n╰━━━━━━━━━━━━━━━━━━╯\n\n`;
    for (const l of lines) out += `▸ ${l}\n`;
    out += `\n━━━━━━━━━━━━━━━━━━━━\n   👑 𝗕𝘆 : ${BOT_NAME}`;
    return out;
}

function splitGraphemes(value) {
    const text = String(value || '').replace(/[\s,，]+/g, '').replace(/\uFE0F/g, '');
    if (!text) return [];
    const parts = (typeof Intl !== 'undefined' && Intl.Segmenter)
        ? Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text), p => p.segment)
        : Array.from(text);
    // normalise so "❤" and "❤️" both match the supported list
    return parts.map(e => EMOJI_LIST.find(s => s.replace(/\uFE0F/g, '') === e) || e);
}

function randomEmojis() {
    return [...EMOJI_LIST].sort(() => Math.random() - 0.5).slice(0, 6);
}

function parseChannelLink(value, requirePost) {
    const raw = String(value || '').trim().replace(/[),.;]+$/, '');
    const m = raw.match(/^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/(\d+))?\/?(?:[?#].*)?$/i);
    if (!m || (requirePost && !m[2]) || (!requirePost && m[2])) return null;
    return {
        url: 'https://whatsapp.com/channel/' + m[1] + (m[2] ? '/' + m[2] : ''),
        code: m[1],
        postId: m[2] || null
    };
}

function parseCountAndEmojis(tokens, defaultCount, defaultEmojis) {
    const rest = [...tokens];
    let count = defaultCount;
    const idx = rest.findIndex(t => /^\d+$/.test(t));
    if (idx !== -1) count = Number(rest.splice(idx, 1)[0]);
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
        throw new Error('Reaction count must be between 1 and 3500.');
    }
    const emojis = rest.length ? splitGraphemes(rest.join('')) : [...defaultEmojis];
    if (!emojis.length) throw new Error('Select at least 1 emoji.');
    if (emojis.length > MAX_EMOJIS) throw new Error('Maximum 10 emojis allowed.');
    const bad = emojis.filter(e => !EMOJI_SET.has(e));
    if (bad.length) {
        throw new Error('Unsupported emoji: ' + bad.join(' ') + '\nSupported: ' + EMOJI_LIST.join(' '));
    }
    return { count, emojis };
}

function helpText() {
    return box('📢 𝗖𝗛𝗔𝗡𝗡𝗘𝗟 𝗥𝗘𝗔𝗖𝗧', [
        '*Single post*',
        '.chreact <post link> [count] [emojis]',
        '.chreact random <post link> [count]',
        '',
        '*7-day auto reactions*',
        '.autoreact <channel link> [count] [emojis]',
        '.chreact weekly <channel link> [count] [emojis]',
        '',
        '*Weekly status*',
        '.chreact status <channel link or ID>',
        '',
        'Defaults: single 250 | weekly 300',
        'Count: 1–3500 | Emojis: 1–10',
        '',
        '*Examples*',
        '.chreact https://whatsapp.com/channel/CODE/123 250 🔥❤️😂',
        '.autoreact https://whatsapp.com/channel/CODE 300 ❤️🔥🚀',
        '.chreact status CODE'
    ]);
}

async function requestJson(url, options = {}) {
    const timeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? { signal: AbortSignal.timeout(30000) } : {};
    const response = await fetch(url, { ...options, ...timeout });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('API did not return valid JSON (HTTP ' + response.status + ').'); }
    if (!response.ok || data?.ok !== true) {
        throw new Error(String(data?.error || data?.message || ('API request failed (HTTP ' + response.status + ').')));
    }
    return data;
}

/**
 * @param {string} rawText  full message text, e.g. ".chreact weekly <link>"
 * @param {string} [forceMode] 'weekly' when called from .autoreact <link>
 */
async function chreactCommand(sock, chatId, rawText, message, forceMode) {
    const reply = text => sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
    const react = emoji => sock.sendMessage(chatId, { react: { text: emoji, key: message.key } }).catch(() => {});

    const tokens = String(rawText || '').trim().split(/\s+/).slice(1).filter(Boolean);
    if (!tokens.length || ['help', 'menu'].includes(tokens[0].toLowerCase())) return reply(helpText());

    let mode = forceMode || 'single';
    if (!forceMode && ['weekly', 'auto', 'status', 'random', 'single'].includes(tokens[0].toLowerCase())) {
        mode = tokens.shift().toLowerCase();
    }

    try {
        await react('⏳');

        if (mode === 'status') {
            const raw = tokens.join(' ').trim();
            if (!raw) return reply('Usage: .chreact status <channel link or channel ID>');
            const lm = raw.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
            const code = lm ? lm[1] : raw;
            if (!/^[A-Za-z0-9_-]{10,45}$/.test(code)) return reply('❌ Send a valid channel link or channel ID.');

            const data = await requestJson(API_BASE + '/api/react/weekly/' + encodeURIComponent(code));
            const sub = data.subscription || {};
            const expiry = sub.expiresAt ? new Date(sub.expiresAt).toLocaleString() : 'Not provided';
            await react('✅');
            return reply(box('📊 𝗪𝗘𝗘𝗞𝗟𝗬 𝗥𝗘𝗔𝗖𝗧 𝗦𝗧𝗔𝗧𝗨𝗦', [
                '🟢 Status : ACTIVE',
                '📢 Channel : ' + String(sub.channelName || code),
                '🔢 Reacts per post : ' + String(sub.count ?? 'N/A'),
                '📬 Posts reacted : ' + String(sub.reactedPostsCount ?? 'N/A'),
                '⏳ Expires : ' + expiry
            ]));
        }

        const isWeekly = mode === 'weekly' || mode === 'auto';
        const linkToken = tokens.find(t => /whatsapp\.com\/channel\//i.test(t));
        const target = parseChannelLink(linkToken, !isWeekly);
        if (!target) {
            await react('❌');
            return reply(isWeekly
                ? '❌ Send a valid channel link.\nFormat: https://whatsapp.com/channel/CHANNEL_CODE'
                : '❌ Send a valid post link.\nFormat: https://whatsapp.com/channel/CHANNEL_CODE/POST_ID');
        }

        const parsed = parseCountAndEmojis(
            tokens.filter(t => t !== linkToken),
            isWeekly ? 300 : 250,
            mode === 'random' ? randomEmojis() : (isWeekly ? ['❤️', '🔥', '🚀'] : ['👍'])
        );

        const data = await requestJson(API_BASE + (isWeekly ? '/api/react/weekly' : '/api/react/single'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: target.url, count: parsed.count, emojis: parsed.emojis })
        });

        await react('✅');

        if (isWeekly) {
            const sub = data.subscription || {};
            const expiry = sub.expiresAt ? new Date(sub.expiresAt).toLocaleString() : '7 days from activation';
            return reply(box('🚀 𝟕-𝗗𝗔𝗬 𝗔𝗨𝗧𝗢 𝗥𝗘𝗔𝗖𝗧 𝗔𝗖𝗧𝗜𝗩𝗔𝗧𝗘𝗗', [
                '✅ ' + String(data.message || 'Weekly pack activated'),
                '📢 Channel : ' + String(sub.channelName || target.code),
                '🆔 JID : ' + String(sub.jid || (target.code + '@newsletter')),
                '🔢 Reacts per new post : ' + parsed.count,
                '😀 Emojis : ' + parsed.emojis.join(' '),
                '⏳ Expires : ' + expiry,
                '',
                'Check status: .chreact status ' + target.code
            ]));
        }

        return reply(box('📢 𝗖𝗛𝗔𝗡𝗡𝗘𝗟 𝗥𝗘𝗔𝗖𝗧 𝗦𝗘𝗡𝗧', [
            '✅ ' + String(data.message || 'Request submitted'),
            '📢 Channel : ' + target.code,
            '📝 Post ID : ' + String(data.postId || target.postId),
            '🔢 Requested reacts : ' + parsed.count,
            '😀 Emojis : ' + parsed.emojis.join(' ')
        ]));
    } catch (error) {
        const detail = String(error?.message || error).slice(0, 450);
        console.error('[CHREACT] failed:', detail);
        await react('❌');
        return reply(box('❌ 𝗖𝗛𝗥𝗘𝗔𝗖𝗧 𝗙𝗔𝗜𝗟𝗘𝗗', [detail]));
    }
}

module.exports = chreactCommand;
module.exports.parseChannelLink = parseChannelLink;
