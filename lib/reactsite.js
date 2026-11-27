'use strict';

/**
 * lib/reactsite.js — drives the MALIYA-MD "WA Channel React Booster" website
 * (https://maliya-md.vercel.app/react.html) with a hidden (headless) browser.
 *
 * The site is a web page, not a JSON API, so we do exactly what a human does:
 * open the page -> pick tab -> paste link -> set count -> pick emojis -> press button,
 * then read the site's own response.
 *
 * Browser lookup order:
 *   1. puppeteer (full)           -> its own bundled Chrome
 *   2. puppeteer-core + CHROME_PATH / PUPPETEER_EXECUTABLE_PATH / system chromium
 *   3. puppeteer-core + @sparticuz/chromium (bundled, works on Railway/Heroku/panels)
 */

const fs = require('fs');

const SITE_URL = process.env.CHREACT_SITE_URL || 'https://maliya-md.vercel.app/react.html';
const OP_TIMEOUT = 90000;

const SYSTEM_CHROME = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/run/current-system/sw/bin/chromium'
].filter(Boolean);

const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-zygote',
    '--mute-audio',
    '--lang=en-US'
];

async function launchBrowser() {
    const errors = [];

    try {
        const puppeteer = require('puppeteer');
        const executablePath = SYSTEM_CHROME.find(p => fs.existsSync(p));
        return await puppeteer.launch({ headless: true, args: LAUNCH_ARGS, ...(executablePath ? { executablePath } : {}) });
    } catch (e) { errors.push('puppeteer: ' + (e.message || e).toString().split('\n')[0]); }

    let core;
    try { core = require('puppeteer-core'); }
    catch { throw new Error('Browser library missing. Run: npm install puppeteer-core @sparticuz/chromium'); }

    const system = SYSTEM_CHROME.find(p => fs.existsSync(p));
    if (system) {
        try { return await core.launch({ headless: true, executablePath: system, args: LAUNCH_ARGS }); }
        catch (e) { errors.push('system chrome: ' + (e.message || e).toString().split('\n')[0]); }
    }

    try {
        const chromium = require('@sparticuz/chromium');
        return await core.launch({
            headless: true,
            executablePath: await chromium.executablePath(),
            args: [...new Set([...(chromium.args || []), ...LAUNCH_ARGS])]
        });
    } catch (e) { errors.push('sparticuz: ' + (e.message || e).toString().split('\n')[0]); }

    throw new Error('Could not start a browser. ' + errors.join(' | '));
}

// one browser job at a time (keeps RAM low on small hosts)
let chain = Promise.resolve();
function enqueue(job) {
    const run = chain.then(job, job);
    chain = run.catch(() => {});
    return run;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').replace(/\uFE0F/g, '').trim();

/** Inside the page: tag the elements of the visible panel that holds `submitText`. */
function tagPanel(submitText, emojiList) {
    const vis = el => !!el && (el.offsetParent !== null || el.getClientRects().length > 0) &&
        getComputedStyle(el).visibility !== 'hidden';
    const n = s => String(s || '').replace(/\uFE0F/g, '').trim();
    document.querySelectorAll('[data-mz]').forEach(e => e.removeAttribute('data-mz'));
    document.querySelectorAll('[data-mz-emoji]').forEach(e => e.removeAttribute('data-mz-emoji'));

    const submit = [...document.querySelectorAll('button, a, [role=button]')]
        .find(b => vis(b) && b.textContent.toLowerCase().includes(submitText.toLowerCase()));
    if (!submit) return { error: 'submit button "' + submitText + '" not found' };

    // panel = nearest ancestor that also contains the channel link input
    const hasLinkInput = c => [...c.querySelectorAll('input, textarea')].some(i =>
        vis(i) && /whatsapp\.com\/channel/i.test((i.placeholder || '') + ' ' + (i.value || '')));
    let panel = submit.parentElement;
    while (panel && panel !== document.body && !hasLinkInput(panel)) panel = panel.parentElement;
    if (!panel || panel === document.body) panel = document.body;

    const inputs = [...panel.querySelectorAll('input, textarea')].filter(vis);
    const link = inputs.find(i => /whatsapp\.com\/channel/i.test((i.placeholder || '') + ' ' + (i.value || ''))) ||
        inputs.find(i => ['text', 'url', 'search', ''].includes(i.type));
    const count = inputs.find(i => i !== link && ['number', 'text', 'tel'].includes(i.type) && i.type !== 'range') ||
        inputs.find(i => i.type === 'range');
    if (!link) return { error: 'link input not found' };

    link.setAttribute('data-mz', 'link');
    if (count) count.setAttribute('data-mz', 'count');
    submit.setAttribute('data-mz', 'submit');

    const clear = [...panel.querySelectorAll('button')].find(b => vis(b) && b.textContent.trim().toLowerCase() === 'clear');
    if (clear) clear.setAttribute('data-mz', 'clear');
    const random = [...panel.querySelectorAll('button')].find(b => vis(b) && /random/i.test(b.textContent));
    if (random) random.setAttribute('data-mz', 'random');

    const found = [];
    panel.querySelectorAll('button, [role=button], div, span').forEach(b => {
        const t = n(b.textContent);
        if (vis(b) && emojiList.includes(t) && !b.querySelector('button')) {
            b.setAttribute('data-mz-emoji', t);
            found.push(t);
        }
    });
    return { emojis: found.length, hasCount: !!count, hasClear: !!clear };
}

function readCounter(panelSubmitText) {
    const vis = el => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
    const root = document.querySelector('[data-mz=submit]');
    let p = root;
    for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
        const m = [...p.querySelectorAll('*')].filter(vis).map(e => e.childElementCount === 0 ? e.textContent.trim() : '')
            .map(t => t.match(/^(\d+)\s*\/\s*10$/)).find(Boolean);
        if (m) return Number(m[1]);
    }
    return null;
}

async function pageText(page) {
    return page.evaluate(() => document.body.innerText || '');
}

function newLines(before, after) {
    const old = new Set(before.split('\n').map(s => s.trim()).filter(Boolean));
    return after.split('\n').map(s => s.trim()).filter(s => s && !old.has(s));
}

async function snapshot(page) {
    try { return await page.screenshot({ type: 'jpeg', quality: 60 }); } catch { return null; }
}

/** Collect every fetch/XHR response the page makes. */
function watchNetwork(page) {
    const calls = [];
    page.on('response', async res => {
        try {
            const type = res.request().resourceType();
            if (type !== 'fetch' && type !== 'xhr') return;
            let body = null;
            try { body = await res.text(); } catch {}
            let json = null;
            try { json = JSON.parse(body); } catch {}
            calls.push({ method: res.request().method(), url: res.url(), status: res.status(), json, body: (body || '').slice(0, 400) });
            console.log('[CHREACT] site call:', res.request().method(), res.url(), res.status());
        } catch {}
    });
    return calls;
}

async function waitForCall(calls, from, ms, filter = () => true) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const hit = calls.slice(from).find(filter);
        if (hit) return hit;
        await sleep(300);
    }
    return null;
}

function interpret(call, lines) {
    const j = call?.json;
    const text = lines.join(' ').slice(0, 300);
    const message = String(j?.message || j?.error || j?.msg || text || '').slice(0, 300);
    if (call) {
        const ok = call.status >= 200 && call.status < 300 && j?.ok !== false && j?.success !== false && !j?.error;
        return { ok, message: message || (ok ? 'Done' : 'HTTP ' + call.status), json: j };
    }
    if (/success|sent|activated|submitted|queued|started/i.test(text) && !/fail|error|invalid/i.test(text)) {
        return { ok: true, message: text, json: null };
    }
    return { ok: false, message: text || 'The site did not respond (no result shown).', json: null };
}

async function openSite(browser) {
    const page = await browser.newPage();
    await page.setViewport({ width: 420, height: 1100 });
    await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36');
    page.setDefaultTimeout(30000);
    const calls = watchNetwork(page);
    await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
    await sleep(800);
    return { page, calls };
}

async function clickText(page, text) {
    return page.evaluate(t => {
        const vis = el => el.offsetParent !== null || el.getClientRects().length > 0;
        const el = [...document.querySelectorAll('button, a, [role=tab], [role=button], div, span')]
            .filter(vis).find(e => e.childElementCount === 0 && e.textContent.trim().toLowerCase() === t.toLowerCase());
        if (el) { el.click(); return true; }
        return false;
    }, text);
}

async function typeInto(page, selector, value) {
    const el = await page.$(selector);
    if (!el) throw new Error('Input not found: ' + selector);
    await el.click({ clickCount: 3 });
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await el.type(String(value), { delay: 15 });
}

/**
 * mode: 'single' | 'weekly'
 * returns { ok, message, json, screenshot }
 */
async function submitReact({ mode, url, count, emojis }) {
    return enqueue(async () => {
        let browser;
        const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out after 90s')), OP_TIMEOUT));
        const work = (async () => {
            browser = await launchBrowser();
            const { page, calls } = await openSite(browser);
            try {
                const weekly = mode === 'weekly';
                await clickText(page, weekly ? 'Weekly Auto Pack' : 'Single Post Pack');
                await sleep(600);

                const submitText = weekly ? 'Activate 1-Week' : 'Send Instant';
                const emojiList = [...new Set(emojis.map(norm))];
                const tag = await page.evaluate(tagPanel, submitText, emojiList);
                if (tag.error) throw new Error('Site layout changed: ' + tag.error);

                await typeInto(page, '[data-mz=link]', url);
                if (tag.hasCount) {
                    await typeInto(page, '[data-mz=count]', count);
                    const v = await page.$eval('[data-mz=count]', e => e.value);
                    if (String(v) !== String(count)) throw new Error('Could not set count (site shows ' + v + ')');
                }

                if (tag.hasClear) { await page.click('[data-mz=clear]'); await sleep(300); }
                for (const e of emojiList) {
                    // the site re-renders the emoji grid after every click, so re-tag each time
                    await page.evaluate(tagPanel, submitText, emojiList);
                    const sel = '[data-mz-emoji="' + e + '"]';
                    if (!(await page.$(sel))) throw new Error('Emoji not found on site: ' + e);
                    await page.click(sel);
                    await sleep(120);
                }
                const counter = await page.evaluate(readCounter);
                if (counter !== null && counter !== emojiList.length) {
                    throw new Error('Emoji selection mismatch (site shows ' + counter + '/10, expected ' + emojiList.length + ')');
                }

                const before = await pageText(page);
                const from = calls.length;
                await page.click('[data-mz=submit]');
                const call = await waitForCall(calls, from, 40000, c => c.method !== 'GET' || /react|weekly|single/i.test(c.url));
                await sleep(1500);
                const lines = newLines(before, await pageText(page))
                    .filter(l => !/^\d+\s*\/\s*10$/.test(l) && l.length < 200);
                const result = interpret(call, lines);
                if (!result.ok) result.screenshot = await snapshot(page);
                return result;
            } catch (err) {
                err.screenshot = await snapshot(page);
                throw err;
            }
        })();
        try {
            return await Promise.race([work, timer]);
        } finally {
            try { await browser?.close(); } catch {}
        }
    });
}

/** Weekly pack status ("Check Active Weekly Pack" box on the page). */
async function checkWeekly(code) {
    return enqueue(async () => {
        let browser;
        const timer = new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out after 90s')), OP_TIMEOUT));
        const work = (async () => {
            browser = await launchBrowser();
            const { page, calls } = await openSite(browser);
            try {
                const tagged = await page.evaluate(() => {
                    const vis = el => el.offsetParent !== null || el.getClientRects().length > 0;
                    document.querySelectorAll('[data-mz]').forEach(e => e.removeAttribute('data-mz'));
                    const btn = [...document.querySelectorAll('button')].find(b => vis(b) && b.textContent.trim().toLowerCase() === 'check');
                    if (!btn) return false;
                    let p = btn.parentElement, input = null;
                    for (let i = 0; i < 6 && p && !input; i++, p = p.parentElement) {
                        input = [...p.querySelectorAll('input')].find(vis) || null;
                    }
                    if (!input) return false;
                    btn.setAttribute('data-mz', 'check-btn');
                    input.setAttribute('data-mz', 'check-input');
                    return true;
                });
                if (!tagged) throw new Error('Site layout changed: status box not found');

                await typeInto(page, '[data-mz=check-input]', code);
                const before = await pageText(page);
                const from = calls.length;
                await page.click('[data-mz=check-btn]');
                const call = await waitForCall(calls, from, 30000);
                await sleep(1500);
                const lines = newLines(before, await pageText(page)).filter(l => l.length < 200);
                const result = interpret(call, lines);
                result.lines = lines;
                if (!result.ok) result.screenshot = await snapshot(page);
                return result;
            } catch (err) {
                err.screenshot = await snapshot(page);
                throw err;
            }
        })();
        try { return await Promise.race([work, timer]); }
        finally { try { await browser?.close(); } catch {} }
    });
}

module.exports = { submitReact, checkWeekly, SITE_URL };
