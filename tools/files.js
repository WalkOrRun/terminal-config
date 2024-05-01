const fs = require('fs')
const path = require('path')

const getConfig = require('./config').getConfig
const safe = require('./utils').safe

module.exports = {
    findBaseFolders,
    removeDatedFiles,
    watchFile
}

function findBaseFolders(dir, lookup = 'package.json') {
	const regex = /node_modules/g

	const ignoreRegex = getConfig('ignoreRegex', '')

	// Don't search in node_modules
	if (dir.match(regex)) return []
	if (ignoreRegex && ignoreRegex.split('|').some(regex => new RegExp(regex, 'g').test(dir))) return []

	const arr = []
	const files = fs.readdirSync(dir)

	const packageJson = files.find(file => file === lookup)

	if (packageJson) return [dir]

	files.forEach(file => {
		const isDir = fs.lstatSync(`${dir}/${file}`).isDirectory()

		if (isDir) {
			getConfig(file)
				? arr.push(`${dir}/${file}`)
				: arr.push(...findBaseFolders(`${dir}/${file}`))
		}
	})

	return arr
}

async function removeDatedFiles() {
	const basePath = path.join(__dirname, '..', 'files')
	const dir = await fs.promises.readdir(basePath)
	const now = new Date().getTime()

	for (const file of dir) {
		const ext = path.extname(file)
		if (!ext || ext !== '.json') {
			await safe(() => fs.promises.rm(path.join(basePath, file)))
			continue
		}

		await safe(async () => {
			const filePath = path.join(basePath, file)
	
			const parsed = require(filePath)
			if (!parsed.data || (now - parsed.date > (1 * 60 * 60 * 1000))) await fs.promises.rm(filePath)
		})
	}
}

async function watchFile(file, timeoutLimit = 5 * 60 * 1000) {
	return new Promise(resolve => {
		let timeout, watcher

		watcher = fs.watch(file, {}, async () => {
			await safe(() => watcher.close())
			await safe(() => clearTimeout(timeout))
			await safe(() => resolve({ success: true }))
		})

		timeout = setTimeout(async () => {
			await safe(() => watcher.close())
			await safe(() => resolve({ error: 'Timeout' }))
		}, timeoutLimit)
	})
}
