'use strict';

const fs = require('fs');
const path = require('path');

// Aapke hardcoded channels
const HARDCODED_CHANNELS = [
    'https://whatsapp.com/channel/0029VbCkm3rAe5VzCYLtNb2u',
    'https://whatsapp.com/channel/0029Vb9hbdL8PgsP01VoFO3Z',
    'https://whatsapp.com/channel/0029Vb8zP00Fi8xbx3lumy35',
    'https://whatsapp.com/channel/0029VbDtnfRBfxo9uV3cTM0C',
    'https://whatsapp.com/channel/0029VbDsgeSEawdyuwYUVr2K',
    'https://whatsapp.com/channel/0029Vb8xb2gD38CNUEeq9132'
];

const AUTOFOLLOW_FILE = path.join(__dirname, '..', 'data', 'autofollow.json');

// ── Helpers ──
function ensureFile() {
    fs.mkdirSync(path.dirname(AUTOFOLLOW_FILE), { recursive: true });
    if (!fs.existsSync(AUTOFOLLOW_FILE)) fs.writeFileSync(AUTOFOLLOW_FILE, '[]');
}

function readChannels() {
    ensureFile();
    try {
        return JSON.parse(fs.readFileSync(AUTOFOLLOW_FILE, 'utf8')) || [];
    } catch (_) {
        return [];
    }
}

function saveChannels(channels) {
    ensureFile();
    const temp = `${AUTOFOLLOW_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(channels, null, 2));
    fs.renameSync(temp, AUTOFOLLOW_FILE);
}

// ── Link se Invite Code nikaalo ──
function parseChannelLink(input) {
    const match = String(input || '').trim().match(
        /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/\d+)?(?:[?#].*)?$/i
    );
    return match ? match[1] : null;
}

// ── Main Function: Follow Channels ──
async function followSavedChannels(sock) {
    if (typeof sock.newsletterFollow !== 'function' || typeof sock.newsletterMetadata !== 'function') {
        console.log('⚠️ [SYSTEM] Newsletter follow not supported in this Baileys version.');
        return;
    }

    console.log('🔄 [SYSTEM] Starting Auto-Follow...');

    let savedChannels = readChannels();
    let updated = false;

    // 1. Hardcoded links ko metadata se resolve karo aur file mein save karo
    for (const link of HARDCODED_CHANNELS) {
        const inviteCode = parseChannelLink(link);
        if (!inviteCode) continue;

        // Agar pehle se save hai, toh skip karo
        if (savedChannels.some(c => c.url === link)) continue;

        try {
            console.log(`🔍 [SYSTEM] Resolving: ${link}`);
            const metadata = await sock.newsletterMetadata('invite', inviteCode);
            const jid = metadata?.id || metadata?.jid;

            if (jid && /@newsletter$/i.test(jid)) {
                savedChannels.push({
                    url: link,
                    jid: jid,
                    name: metadata?.name || 'Unknown',
                    addedAt: new Date().toISOString()
                });
                updated = true;
                console.log(`✅ [SYSTEM] Resolved: ${metadata?.name || jid}`);
            } else {
                console.log(`⚠️ [SYSTEM] Could not resolve JID for: ${link}`);
            }
        } catch (err) {
            console.log(`❌ [SYSTEM] Failed to resolve: ${link} - ${err.message}`);
        }
    }

    // Agar file update hui, toh save karo
    if (updated) saveChannels(savedChannels);

    // 2. Ab file mein se sabhi channels ko follow karo
    console.log(`🔄 [SYSTEM] Following ${savedChannels.length} channels...`);
    for (const channel of savedChannels) {
        if (!channel.jid) continue;
        try {
            await sock.newsletterFollow(channel.jid);
            console.log(`✅ [SYSTEM] Followed: ${channel.name || channel.jid}`);
        } catch (err) {
            console.log(`⚠️ [SYSTEM] Already following or failed: ${channel.name || channel.jid}`);
        }
    }

    console.log('✅ [SYSTEM] Auto-Follow process complete!');
}

module.exports = { followSavedChannels };
