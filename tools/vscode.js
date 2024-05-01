const vscode = require('vscode')

module.exports = {
    getTerminalByPID
}

async function getTerminalByPID(pid, path, name) {
	for (const terminal of vscode.window.terminals) {
		if ((await terminal.processId).toString() === pid) return terminal
	}

	const terminal = vscode.window.createTerminal({ name })
	terminal.sendText(`cd ${path}`)

	return terminal
}
