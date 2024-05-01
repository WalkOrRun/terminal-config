const vscode = require('vscode')

const { getConfig } = require('./config')
const { safe } = require('./utils')
const { commandSeperator } = require('./process')
const { handleDynamicCommands } = require('./dynamic_commands')

const keyCommands = { global: {} }

module.exports = {
	setGlobalKeyBinds,
	setLocalKeyBinds,
	handleKeyBinds,
	getKeybind,
	setKeybind
}

async function getKeybind(key, baseKey) {
	if (baseKey) return safe(() => keyCommands[baseKey][key])
}

// This is for external use, internal can be handled via the object itself. (Maybe swap to class?)
function setKeybind ({ key, baseKey, value }) {
	if (baseKey && key) {
		if (!keyCommands[baseKey]) keyCommands[baseKey] = {}

		keyCommands[baseKey][key] = value
	}
	else if (baseKey) keyCommands[baseKey] = value
	else if (key) keyCommands[key] = value
}

function setGlobalKeyBinds () {
	const globalKeyBinds = getConfig('globalKeyBinds', {})

	for (const [key, value] of (Object.entries(globalKeyBinds))) {
		keyCommands.global[key] = {}
		Object.assign(keyCommands.global[key], value)
	}
}

function setLocalKeyBinds (terminalsHash) {
	const uniqueFolders = new Set()

	Object.values(terminalsHash).forEach(configurationKey => {
		if (!uniqueFolders.has(configurationKey)) {
			uniqueFolders.add(configurationKey)
			const keybinds = getConfig(configurationKey)

			if (keybinds) keyCommands[configurationKey] = { ...keybinds }
		}
	})
}

async function handleKeyBinds (context, folderPaths, terminalsHash) {
	// Build keybinds for the workspace
	const keybind = context[0]
	const activeTerminal = vscode.window.activeTerminal

	const workspaceKey = getActiveWorkspace(activeTerminal, terminalsHash)

	const configurationSettings = getConfig(workspaceKey, {})
	let command = getKeybindCommand(workspaceKey, activeTerminal, configurationSettings, keybind)

	if (!command) return vscode.window.showErrorMessage(`Terminal-Config: No keybinds set for cntrl+shift+${keybind}`)

	// Cheep deep copy unless we add more properties in the command object
	command = { commands: [...command.commands] }

	// We may need to create a terminal .-.
	const path = folderPaths[workspaceKey] || folderPaths[Object.values(folderPaths)[0]]
	const name = (configurationSettings && configurationSettings.name) || workspaceKey || 'keybind-terminal'

	const dynamicCommandsRegex = /:[\s\S]*:/
	const dynamicCommands = (command.commands || []).filter(command => dynamicCommandsRegex.test(command))

	const terminal = getKeybindTerminal(path, name)

	if (dynamicCommands.length) {
		const terminalInformation = {
			name: terminal.name,
			pid: (await terminal.processId).toString()
		}
		await handleDynamicCommands([{ commands: command.commands, baseFolder: path, terminalInformation }], terminal)

		delete command.commands
	}
	
	await useKeyBind(terminal, command)
}

function getActiveWorkspace(activeTerminal, terminalsHash) {
	const key = activeTerminal && terminalsHash[activeTerminal.name]
	if (key) return key

	const uniqueFolders = Object.values(terminalsHash).reduce((acc, cur) => {
		if (!acc.has(cur)) acc.add(cur)

		return acc
	}, new Set())

	if (uniqueFolders.size === 1) return uniqueFolders.keys().next().value
}

function getKeybindCommand (workspaceKey, activeTerminal, configurationSettings, keybind) {
	const dontCreateTerminal = !activeTerminal && (configurationSettings ? configurationSettings.createTerminalForKeybindsIfNoTerminal : !getConfig('createTerminalForKeybindsIfNoTerminal'))
	if (dontCreateTerminal) return

	if (!keyCommands.profile) keyCommands.profile = {}

	const keybinds = keyCommands[workspaceKey] || keyCommands.profile.default || {}

	return (keybinds && keybinds.keybinds && keybinds.keybinds[keybind]) || keyCommands.global[keybind]
}

function getKeybindTerminal(path, name) {
	let terminal = vscode.window.activeTerminal

	if (!terminal) {
		terminal = vscode.window.createTerminal({ name })
		terminal.sendText(`cd ${path || ''}`)
		terminal.show()
	}

	return terminal
}


async function useKeyBind(terminal, keybind) {
	if (keybind.actions) for (const action of keybind.actions) await vscode.commands.executeCommand(`terminal-config.${action}`)
	if (keybind.commands && keybind.commands.length) terminal.sendText(keybind.commands.join(commandSeperator))
}
