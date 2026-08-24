const vscode = require('vscode')

const { safe } = require('./utils')

// <paste> or <paste:some label> (The label is only used when we have to ask for the value)
const pasteRegex = /<paste(?::([^<>]*))?>/g
const hasPasteRegex = /<paste(?::([^<>]*))?>/

module.exports = {
	hasPasteCommand,
	resolvePasteCommands
}

function hasPasteCommand (command) {
	return typeof command === 'string' && hasPasteRegex.test(command)
}

/**
 * - Replaces every <paste> with the current clipboard contents
 * - If the clipboard is empty we fall back to a dynamic command (:paste:) so the user gets asked for it
 *
 * @param {string[]} commands - the commands to resolve
 * @returns {Promise<string[]>} the same commands with every <paste> resolved
 */
async function resolvePasteCommands (commands) {
	if (!commands || !commands.length) return commands || []
	if (!commands.some(hasPasteCommand)) return commands

	const clipboard = ((await safe(() => vscode.env.clipboard.readText())) || '').trim()

	if (!clipboard) vscode.window.showInformationMessage('Terminal-Config: Clipboard is empty, asking for the <paste> value(s) instead.')

	return commands.map(command => {
		if (typeof command !== 'string') return command

		return command.replace(pasteRegex, (match, label) => clipboard || `:${label || 'paste'}:`)
	})
}
