// ============================================
// 📥 VIEW ONCE CORE — MUZAMIL-XD
// Ported from the Arslan-MD vv plugin (REDXMINI-BOT v8.0 Advanced View-Once
// Retriever by Abdul Rehman Rajpoot, used with the creator's permission):
//   • view_once_unavailable stub detection
//   • raw-first view-once detection (wrapper OR flat viewOnce flag)
//   • mediaKey checks / normalisation
//   • 5-strategy download cascade (robustDownload)
//   • arrival-time cache (sock._viewOnceCache) + original-message store
//     (sock._msgStore) — WhatsApp strips the media key from QUOTED view-once
//     messages, so the only reliable copy is the one saved on arrival.
//
// WHY THIS NEEDS THE ANDROID-PHONE IDENTITY:
// WhatsApp withholds view-once media from web-class companions (Ubuntu /
// Safari / macOS identity) server-side. index.js therefore runs registered
// sessions as ['Chrome','Android','15'] (see getBrowserIdentity there).
// ============================================

const {
    downloadContentFromMessage,
    downloadMediaMessage,
    normalizeMessageContent,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');

const _normalise = (typeof normalizeMessageContent === 'function')
    ? normalizeMessageContent
    : (msg) => msg;

const SILENT_LOGGER = {
    level: 'silent',
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {},
    child: () => SILENT_LOGGER,
};

// ── limits (the bot restarts itself above ~400MB RSS, so keep these small) ──
const CACHE_MAX_ENTRIES = 40;
const CACHE_MAX_BYTES = 48 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000;
const STORE_MAX_CHATS = 100;
const STORE_MAX_PER_CHAT = 30;
const MAX_AUTO_CACHE_BYTES = 25 * 1024 * 1024; // skip caching huge videos

/* ───────────────── stub detection ───────────────── */
// WhatsApp sends a CIPHERTEXT stub with messageStubParameters containing
// 'view_once_unavailable' (or key.isViewOnce with no payload) to a
// non-Android companion.
function isViewOnceUnavailableStub(msg) {
    if (!msg) return false;
    const params = msg.messageStubParameters || [];
    if (params.includes('view_once_unavailable')) return true;
    if (msg.key?.isViewOnce === true && (!msg.message || !Object.keys(msg.message).length)) return true;
    return false;
}

/* ───────────────── wrapper peeling ───────────────── */
function unwrapWrappers(message) {
    let m = message;
    for (let i = 0; i < 8 && m; i++) {
        if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
        if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
        if (m.viewOnceMessageV2Extension?.message) { m = m.viewOnceMessageV2Extension.message; continue; }
        if (m.messageContextInfo && Object.keys(m).length > 1) {
            const { messageContextInfo: _, ...rest } = m;
            if (Object.keys(rest).length) { m = rest; continue; }
        }
        break;
    }
    return m || {};
}

function unwrapForDownload(inner) {
    let m = inner;
    for (let i = 0; i < 6 && m; i++) {
        if (m.viewOnceMessageV2Extension?.message) { m = m.viewOnceMessageV2Extension.message; continue; }
        if (m.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; continue; }
        if (m.viewOnceMessage?.message) { m = m.viewOnceMessage.message; continue; }
        if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
        if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
        break;
    }
    return m || inner;
}

/* ───────────────── detection ───────────────── */
// Returns { mtype: 'image'|'video'|'audio'|'ptt', msgObj, inner } or null.
// Raw message is checked FIRST: Baileys' normalizeMessageContent peels the
// viewOnce wrappers, so checking after normalising never fires for wrapped
// messages. Raw-first catches both (wrapped, or flat viewOnce flag).
function detectViewOnce(quotedMsg) {
    if (!quotedMsg) return null;
    let m = quotedMsg;
    for (let i = 0; i < 8 && m; i++) {
        if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
        if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
        if (m.messageContextInfo && Object.keys(m).length > 1) {
            const { messageContextInfo: _, ...rest } = m;
            if (Object.keys(rest).length) { m = rest; continue; }
        }
        break;
    }
    function extractMedia(inner, wrapperKey) {
        if (!inner) return null;
        if (inner.imageMessage) {
            return { mtype: 'image', msgObj: inner.imageMessage, inner: { [wrapperKey]: { message: inner } } };
        }
        if (inner.videoMessage) {
            return { mtype: 'video', msgObj: inner.videoMessage, inner: { [wrapperKey]: { message: inner } } };
        }
        if (inner.audioMessage) {
            const mtype = inner.audioMessage.ptt ? 'ptt' : 'audio';
            return { mtype, msgObj: inner.audioMessage, inner: { [wrapperKey]: { message: inner } } };
        }
        return null;
    }
    const r1 = extractMedia(m.viewOnceMessage?.message, 'viewOnceMessage');
    if (r1) return r1;
    const r2 = extractMedia(m.viewOnceMessageV2?.message, 'viewOnceMessageV2');
    if (r2) return r2;
    const r3 = extractMedia(m.viewOnceMessageV2Extension?.message, 'viewOnceMessageV2Extension');
    if (r3) return r3;
    // Fallback: flat viewOnce flag on the media node.
    let normalised = quotedMsg;
    try { normalised = _normalise(quotedMsg) || quotedMsg; } catch (_) {}
    const q = unwrapWrappers(normalised);
    if (q.imageMessage?.viewOnce) return { mtype: 'image', msgObj: q.imageMessage, inner: q };
    if (q.videoMessage?.viewOnce) return { mtype: 'video', msgObj: q.videoMessage, inner: q };
    if (q.audioMessage?.viewOnce) {
        const mtype = q.audioMessage.ptt ? 'ptt' : 'audio';
        return { mtype, msgObj: q.audioMessage, inner: q };
    }
    return null;
}

/* ───────────────── mediaKey helpers ───────────────── */
function mediaKeyByteLength(mediaKey) {
    if (!mediaKey) return 0;
    if (Buffer.isBuffer(mediaKey) || mediaKey instanceof Uint8Array) return mediaKey.length;
    if (typeof mediaKey === 'string') {
        try { return Buffer.from(mediaKey, 'base64').length; } catch { return 0; }
    }
    if (Array.isArray(mediaKey)) return mediaKey.length;
    if (typeof mediaKey === 'object') {
        if (Array.isArray(mediaKey.data)) return mediaKey.data.length;
        return Object.keys(mediaKey).filter(k => /^\d+$/.test(k)).length;
    }
    return 0;
}

function hasUsableMediaKey(mediaNode) {
    // Baileys media HKDF needs the original non-empty encryption key.
    return mediaKeyByteLength(mediaNode?.mediaKey) >= 16;
}

function ensureMediaKeyBuffer(msgObj) {
    if (!msgObj) return msgObj;
    const mk = msgObj.mediaKey;
    if (!mk) return msgObj;
    if (Buffer.isBuffer(mk) || mk instanceof Uint8Array) return msgObj;
    if (typeof mk === 'string') return { ...msgObj, mediaKey: Buffer.from(mk, 'base64') };
    if (typeof mk === 'object') {
        const values = Array.isArray(mk.data)
            ? mk.data
            : Object.keys(mk).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map(k => mk[k]);
        return { ...msgObj, mediaKey: Uint8Array.from(values) };
    }
    return msgObj;
}

function normaliseInnerMediaKeys(inner) {
    if (!inner || typeof inner !== 'object') return inner;
    const clone = { ...inner };
    for (const key of ['imageMessage', 'videoMessage', 'audioMessage']) {
        if (clone[key]) clone[key] = ensureMediaKeyBuffer(clone[key]);
    }
    for (const wk of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage', 'documentWithCaptionMessage']) {
        if (clone[wk]?.message) {
            clone[wk] = { ...clone[wk], message: normaliseInnerMediaKeys(clone[wk].message) };
        }
    }
    return clone;
}

async function streamToBuffer(stream) {
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (!part.length) continue;
        chunks.push(part);
        total += part.length;
    }
    return total ? Buffer.concat(chunks, total) : Buffer.alloc(0);
}

async function downloadContentBuffer(msgObj, mediaType) {
    const typeKey = mediaType === 'ptt' ? 'audio' : mediaType;
    const stream = await downloadContentFromMessage(ensureMediaKeyBuffer(msgObj), typeKey);
    return streamToBuffer(stream);
}

/* ───────────────── master download cascade ───────────────── */
// quotedKey = { remoteJid, id, participant } of the view-once message.
// rawQuoted = the raw message proto (for the fresh-peel strategy).
async function robustDownload(sock, quotedKey, msgObj, inner, mtype, rawQuoted) {
    const typeKey = mtype === 'ptt' ? 'audio' : mtype;
    const mediaTypeKey = `${typeKey}Message`;
    if (!hasUsableMediaKey(msgObj)) {
        console.warn('[VV-DL] skipped: metadata-only media stub has no usable mediaKey.');
        return null;
    }
    // S1: direct CDN download (fast path when the URL is still valid)
    if (msgObj?.url || msgObj?.directPath) {
        try {
            const buf = await downloadContentBuffer(msgObj, mtype);
            if (buf && buf.length > 0) { console.log('[VV-DL] S1 ok'); return buf; }
        } catch (e) { console.log('[VV-DL] S1 fail:', e.message); }
    }
    // S2: peel rawQuoted fresh, then direct CDN download
    if (rawQuoted) {
        try {
            let rq = rawQuoted;
            if (rq.ephemeralMessage?.message) rq = rq.ephemeralMessage.message;
            if (rq.viewOnceMessageV2Extension?.message) rq = rq.viewOnceMessageV2Extension.message;
            if (rq.viewOnceMessageV2?.message) rq = rq.viewOnceMessageV2.message;
            if (rq.viewOnceMessage?.message) rq = rq.viewOnceMessage.message;
            if (rq.documentWithCaptionMessage?.message) rq = rq.documentWithCaptionMessage.message;
            const rawNode = rq[mediaTypeKey];
            if (rawNode?.url || rawNode?.directPath) {
                if (!hasUsableMediaKey(rawNode)) throw new Error('Raw media node has no usable mediaKey');
                const buf = await streamToBuffer(await downloadContentFromMessage(ensureMediaKeyBuffer(rawNode), typeKey));
                if (buf.length > 0) { console.log('[VV-DL] S2 ok'); return buf; }
            }
        } catch (e) { console.log('[VV-DL] S2 fail:', e.message); }
    }
    // S3: updateMediaMessage refresh, then direct CDN download
    if (typeof sock.updateMediaMessage === 'function') {
        try {
            const stubNode = ensureMediaKeyBuffer(msgObj);
            const fakeForReupload = { key: quotedKey, message: { [mediaTypeKey]: stubNode } };
            const refreshed = await sock.updateMediaMessage(fakeForReupload);
            const refreshedNode = refreshed?.message?.[mediaTypeKey] || fakeForReupload.message[mediaTypeKey];
            if (refreshedNode?.url || refreshedNode?.directPath) {
                const buf = await streamToBuffer(await downloadContentFromMessage(ensureMediaKeyBuffer(refreshedNode), typeKey));
                if (buf.length > 0) { console.log('[VV-DL] S3 ok'); return buf; }
            }
        } catch (e) { console.log('[VV-DL] S3 fail:', e.message); }
    }
    // S4: reupload + downloadMediaMessage (Baileys helper)
    try {
        const fixedInner = normaliseInnerMediaKeys(unwrapForDownload(inner));
        const fakeMsg = { key: quotedKey, message: fixedInner };
        let messageForDownload = fakeMsg;
        if (typeof sock.updateMediaMessage === 'function') {
            try {
                const refreshed = await sock.updateMediaMessage(fakeMsg);
                if (refreshed?.message) messageForDownload = refreshed;
            } catch {}
        }
        const buf = await downloadMediaMessage(messageForDownload, 'buffer', {}, {
            logger: SILENT_LOGGER,
            reuploadRequest: typeof sock.updateMediaMessage === 'function'
                ? sock.updateMediaMessage.bind(sock) : undefined,
        });
        if (buf && buf.length > 0) { console.log('[VV-DL] S4 ok'); return buf; }
    } catch (e) { console.log('[VV-DL] S4 fail:', e.message); }
    // S5: downloadMediaMessage without reupload (bare fallback)
    try {
        const fakeMsg = { key: quotedKey, message: normaliseInnerMediaKeys(unwrapForDownload(inner)) };
        const buf = await downloadMediaMessage(fakeMsg, 'buffer', {}, { logger: SILENT_LOGGER });
        if (buf && buf.length > 0) { console.log('[VV-DL] S5 ok'); return buf; }
    } catch (e) { console.log('[VV-DL] S5 fail:', e.message); }
    return null;
}

/* ───────────────── arrival cache + original store ───────────────── */
function getCache(sock) {
    if (!sock._viewOnceCache) {
        sock._viewOnceCache = new Map(); // id -> { buffer, mtype, msgObj, ts }
        sock._viewOnceCacheBytes = 0;
    }
    return sock._viewOnceCache;
}

function cachePut(sock, id, entry) {
    const cache = getCache(sock);
    const old = cache.get(id);
    if (old) { sock._viewOnceCacheBytes -= old.buffer.length; cache.delete(id); }
    cache.set(id, entry);
    sock._viewOnceCacheBytes += entry.buffer.length;
    // evict oldest first
    while (cache.size > CACHE_MAX_ENTRIES || sock._viewOnceCacheBytes > CACHE_MAX_BYTES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) break;
        sock._viewOnceCacheBytes -= cache.get(oldestKey).buffer.length;
        cache.delete(oldestKey);
    }
}

function cacheGet(sock, id) {
    const cache = sock?._viewOnceCache;
    if (!cache || !id) return null;
    const entry = cache.get(id);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        sock._viewOnceCacheBytes -= entry.buffer.length;
        cache.delete(id);
        return null;
    }
    return entry;
}

function getStore(sock) {
    if (!sock._msgStore) sock._msgStore = new Map(); // jid -> Map(id -> msg)
    return sock._msgStore;
}

function storePut(sock, msg) {
    const jid = msg?.key?.remoteJid;
    const id = msg?.key?.id;
    if (!jid || !id || !msg.message) return;
    const store = getStore(sock);
    let chat = store.get(jid);
    if (!chat) {
        chat = new Map();
        store.set(jid, chat);
        while (store.size > STORE_MAX_CHATS) store.delete(store.keys().next().value);
    } else {
        // refresh recency
        store.delete(jid);
        store.set(jid, chat);
    }
    chat.set(id, msg);
    while (chat.size > STORE_MAX_PER_CHAT) chat.delete(chat.keys().next().value);
}

function storeFind(sock, remoteJid, id) {
    const store = sock?._msgStore;
    if (!store || !id) return null;
    const direct = store.get(remoteJid)?.get(id);
    if (direct?.message) return direct;
    for (const chat of store.values()) {
        const hit = chat.get(id);
        if (hit?.message) return hit;
    }
    return null;
}

function hasMediaNode(message) {
    const m = unwrapForDownload(unwrapWrappers(message));
    return Boolean(m?.imageMessage || m?.videoMessage || m?.audioMessage);
}

/**
 * Call for EVERY messages.upsert batch, before any early return.
 * - remembers `view_once_unavailable` stubs (so .vv can explain the failure)
 * - keeps the original media-bearing messages (mediaKey intact) in sock._msgStore
 * - downloads incoming view-once media right away into sock._viewOnceCache
 */
function captureIncoming(sock, chatUpdate) {
    try {
        const messages = chatUpdate?.messages || [];
        for (const msg of messages) {
            if (!msg?.key?.id) continue;
            if (msg.key.remoteJid === 'status@broadcast') continue;

            if (isViewOnceUnavailableStub(msg)) {
                if (!sock._vvUnavailable) sock._vvUnavailable = new Set();
                sock._vvUnavailable.add(msg.key.id);
                if (sock._vvUnavailable.size > 200) sock._vvUnavailable.delete(sock._vvUnavailable.values().next().value);
                console.warn('[VV] view_once_unavailable stub received — WhatsApp withheld the media (browser identity is not Android).');
                continue;
            }
            if (!msg.message) continue;

            if (!hasMediaNode(msg.message)) continue;
            storePut(sock, msg);

            const detected = detectViewOnce(msg.message);
            if (!detected || msg.key.fromMe || chatUpdate.type !== 'notify') continue;
            const declared = Number(detected.msgObj?.fileLength || 0);
            if (declared > MAX_AUTO_CACHE_BYTES) continue;

            const quotedKey = { remoteJid: msg.key.remoteJid, id: msg.key.id, participant: msg.key.participant };
            robustDownload(sock, quotedKey, detected.msgObj, detected.inner, detected.mtype, msg.message)
                .then(buf => {
                    if (buf?.length) {
                        cachePut(sock, msg.key.id, { buffer: buf, mtype: detected.mtype, msgObj: detected.msgObj, ts: Date.now() });
                        console.log(`[VV] cached incoming view-once ${detected.mtype} (${msg.key.id})`);
                    }
                })
                .catch(e => console.log('[VV] arrival cache fail:', e.message));
        }
    } catch (e) {
        console.log('[VV] captureIncoming error:', e.message);
    }
}

/* ───────────────── reply helpers ───────────────── */
function getContextInfo(message) {
    let m = message?.message;
    for (let i = 0; i < 5 && m; i++) {
        if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
        if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
        if (m.viewOnceMessageV2?.message) { m = m.viewOnceMessageV2.message; continue; }
        if (m.viewOnceMessage?.message) { m = m.viewOnceMessage.message; continue; }
        break;
    }
    if (!m || typeof m !== 'object') return null;
    for (const key of Object.keys(m)) {
        const ci = m[key]?.contextInfo;
        if (ci && (ci.quotedMessage || ci.stanzaId)) return ci;
    }
    return null;
}

function getQuotedMessage(message) {
    return getContextInfo(message)?.quotedMessage || null;
}

function selfJid(sock, fallback) {
    try {
        if (sock?.user?.id) return jidNormalizedUser(sock.user.id);
    } catch (_) {}
    return fallback;
}

/**
 * Full retrieval pipeline for a reply message.
 * Order: arrival cache → original message (store / session store) → quoted
 * copy with the 5-strategy cascade.
 * Returns { status, buffer?, mtype?, msgObj? } where status is one of
 * 'ok' | 'no-quote' | 'not-viewonce' | 'unavailable' | 'failed' | 'no-key'.
 */
async function retrieveViewOnce(sock, message) {
    const ctx = getContextInfo(message);
    const rawQuoted = ctx?.quotedMessage || null;
    const quotedId = ctx?.stanzaId || null;
    if (!ctx || (!rawQuoted && !quotedId)) return { status: 'no-quote' };

    const quotedKey = {
        remoteJid: ctx.remoteJid || message.key.remoteJid,
        id: quotedId,
        participant: ctx.participant || undefined,
    };

    // 0) arrival cache — media was saved the moment it arrived
    const cached = cacheGet(sock, quotedId);
    if (cached) {
        console.log('[VV-DL] cache ok');
        return { status: 'ok', buffer: cached.buffer, mtype: cached.mtype, msgObj: cached.msgObj };
    }

    // stub received on arrival → WhatsApp never delivered the media
    if (quotedId && sock._vvUnavailable?.has(quotedId)) return { status: 'unavailable' };

    let detected = detectViewOnce(rawQuoted);

    // 0b) original message (has the real mediaKey/URL; the quote usually doesn't)
    let original = storeFind(sock, quotedKey.remoteJid, quotedId);
    if (!original && sock.sessionStore?.loadMessage) {
        try { original = await sock.sessionStore.loadMessage(quotedKey.remoteJid, quotedId); } catch (_) {}
    }
    if (original?.message) {
        const origDetected = detectViewOnce(original.message);
        if (origDetected?.msgObj) {
            if (!detected) detected = origDetected;
            try {
                const buf = await robustDownload(sock, quotedKey, origDetected.msgObj, origDetected.inner, origDetected.mtype, original.message);
                if (buf?.length) {
                    console.log('[VV-DL] store ok');
                    return { status: 'ok', buffer: buf, mtype: origDetected.mtype, msgObj: origDetected.msgObj };
                }
            } catch (e) { console.log('[VV-DL] store download fail:', e.message); }
        }
    }

    if (!detected) return { status: 'not-viewonce' };

    // 1) the quoted copy itself
    let buffer = null;
    try {
        buffer = await robustDownload(sock, quotedKey, detected.msgObj, detected.inner, detected.mtype, rawQuoted);
    } catch (e) { console.log('[VV-DL] cascade error:', e.message); }

    if (buffer?.length) return { status: 'ok', buffer, mtype: detected.mtype, msgObj: detected.msgObj };
    return { status: hasUsableMediaKey(detected.msgObj) ? 'failed' : 'no-key', mtype: detected.mtype, msgObj: detected.msgObj };
}

module.exports = {
    isViewOnceUnavailableStub,
    detectViewOnce,
    hasUsableMediaKey,
    robustDownload,
    captureIncoming,
    retrieveViewOnce,
    getContextInfo,
    getQuotedMessage,
    selfJid,
};
