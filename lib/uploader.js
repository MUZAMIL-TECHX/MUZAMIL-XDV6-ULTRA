/**
 * Knight Bot - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
let axios = require('axios')
let BodyForm = require('form-data')
let { fromBuffer } = require('file-type')
let fetch = require('node-fetch')
let fs = require('fs')
let path = require('path')
let cheerio = require('cheerio')



function TelegraPh (Path) {
	return new Promise (async (resolve, reject) => {
		if (!fs.existsSync(Path)) return reject(new Error("File not Found"))
		try {
			const form = new BodyForm();
			form.append("file", fs.createReadStream(Path))
			const data = await  axios({
				url: "https://telegra.ph/upload",
				method: "POST",
				headers: {
					...form.getHeaders()
				},
				data: form
			})
			return resolve("https://telegra.ph" + data.data[0].src)
		} catch (err) {
			return reject(new Error(String(err)))
		}
	})
}

async function UploadFileUgu (input) {
	return new Promise (async (resolve, reject) => {
			const form = new BodyForm();
			form.append("files[]", fs.createReadStream(input))
			await axios({
				url: "https://uguu.se/upload.php",
				method: "POST",
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
					...form.getHeaders()
				},
				data: form
			}).then((data) => {
				resolve(data.data.files[0])
			}).catch((err) => reject(err))
	})
}

function webp2mp4File(path) {
	return new Promise((resolve, reject) => {
		 const form = new BodyForm()
		 form.append('new-image-url', '')
		 form.append('new-image', fs.createReadStream(path))
		 axios({
			  method: 'post',
			  url: 'https://s6.ezgif.com/webp-to-mp4',
			  data: form,
			  headers: {
				   'Content-Type': `multipart/form-data; boundary=${form._boundary}`
			  }
		 }).then(({ data }) => {
			  const bodyFormThen = new BodyForm()
			  const $ = cheerio.load(data)
			  const file = $('input[name="file"]').attr('value')
			  bodyFormThen.append('file', file)
			  bodyFormThen.append('convert', "Convert WebP to MP4!")
			  axios({
				   method: 'post',
				   url: 'https://ezgif.com/webp-to-mp4/' + file,
				   data: bodyFormThen,
				   headers: {
						'Content-Type': `multipart/form-data; boundary=${bodyFormThen._boundary}`
				   }
			  }).then(({ data }) => {
				   const $ = cheerio.load(data)
				   const result = 'https:' + $('div#output > p.outfile > video > source').attr('src')
				   resolve({
						status: true,
						message: "Created By MRHRTZ",
						result: result
				   })
			  }).catch(reject)
		 }).catch(reject)
	})
}

async function floNime(medianya, options = {}) {
const { ext } = await fromBuffer(medianya) || options.ext
        var form = new BodyForm()
        form.append('file', medianya, 'tmp.'+ext)
        let jsonnya = await fetch('https://flonime.my.id/upload', {
                method: 'POST',
                body: form
        })
        .then((response) => response.json())
        return jsonnya
}

// ───────────────────────────────────────────────────────────
// Buffer -> public URL (multiple hosts, first one that works wins)
// Used by removebg and any command that needs an image URL.
// ───────────────────────────────────────────────────────────
const firstUrl = (v) => {
	if (!v) return null
	if (typeof v === 'string') return /^https?:\/\//i.test(v.trim()) ? v.trim() : null
	if (Array.isArray(v)) { for (const x of v) { const u = firstUrl(x); if (u) return u } return null }
	if (typeof v === 'object') {
		for (const k of ['url', 'result', 'link', 'src', 'data', 'files']) { const u = firstUrl(v[k]); if (u) return u }
	}
	return null
}

async function uploadBuffer(buffer) {
	if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Empty buffer')
	const ft = await fromBuffer(buffer).catch(() => null)
	const ext = ft?.ext || 'jpg'
	const mime = ft?.mime || 'image/jpeg'
	const dir = path.join(process.cwd(), 'tmp')
	fs.mkdirSync(dir, { recursive: true })
	const file = path.join(dir, `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`)
	fs.writeFileSync(file, buffer)

	const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' }
	const hosts = [
		['catbox', async () => {
			const form = new BodyForm()
			form.append('reqtype', 'fileupload')
			form.append('fileToUpload', buffer, { filename: `image.${ext}`, contentType: mime })
			const r = await axios.post('https://catbox.moe/user/api.php', form, { headers: { ...UA, ...form.getHeaders() }, timeout: 45000, maxBodyLength: Infinity })
			return firstUrl(r.data)
		}],
		['uguu', async () => firstUrl(await UploadFileUgu(file))],
		['telegraph', async () => TelegraPh(file)],
		['flonime', async () => firstUrl(await floNime(buffer, { ext }))]
	]

	const errors = []
	try {
		for (const [name, run] of hosts) {
			try {
				const url = firstUrl(await run())
				if (url) return url
				errors.push(`${name}: no url`)
			} catch (e) {
				errors.push(`${name}: ${e.message}`)
			}
		}
		throw new Error('All upload hosts failed -> ' + errors.join(' | '))
	} finally {
		try { fs.unlinkSync(file) } catch (_) {}
	}
}

module.exports = { TelegraPh, UploadFileUgu, webp2mp4File, floNime, uploadBuffer }