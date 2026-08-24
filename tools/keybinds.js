const vscode = require('vscode')

const { getConfig } = require('./config')
const { safe } = require('./utils')
const { commandSeperator } = require('./process')
const { handleDynamicCommands } = require('./dynamic_commands')
const { resolvePasteCommands } = require('./clipboard')

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
	const activeTerminal = vscode.window.activeTerminal

	const workspaceKey = getActiveWorkspace(activeTerminal, terminalsHash)

	const configurationSettings = getConfig(workspaceKey, {}) || {}

	// A keybind can come in as [1] (our own keybindings), 'deploy', { key: 'deploy' } or as a whole keybind object
	let { keybind, command } = parseKeybindContext(context)

	// Nothing was handed to us (command palette, or a keybind with no args), so let the user pick one
	if (!command && keybind == null) ({ keybind, command } = await pickKeybind(workspaceKey) || {})
	if (!command && keybind != null) command = getKeybindCommand(workspaceKey, keybind)

	if (!command) {
		if (keybind != null) vscode.window.showErrorMessage(`Terminal-Config: No keybinds set for '${keybind}'`)

		return
	}

	// Cheep deep copy unless we add more properties in the command object
	command = {
		commands: await resolvePasteCommands([...(command.commands || [])]),
		actions: command.actions && [...command.actions]
	}

	// Actions don't need a terminal, so only go looking for one when we have something to send
	const terminal = command.commands.length && getKeybindTerminal(activeTerminal, configurationSettings, keybind, workspaceKey, folderPaths)

	if (command.commands.length && !terminal) return

	const dynamicCommandsRegex = /:[\s\S]*:/
	const dynamicCommands = command.commands.filter(command => dynamicCommandsRegex.test(command))

	if (dynamicCommands.length) {
		const path = getKeybindPath(workspaceKey, folderPaths)
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

function createTerminalForKeybinds (configurationSettings) {
	const setting = configurationSettings && configurationSettings.createTerminalForKeybindsIfNoTerminal

	return setting != null ? setting : getConfig('createTerminalForKeybindsIfNoTerminal')
}

/**
 * - Keybinds are passed along as the `args` of the keybinding, so they can be anything the user typed in their keybindings.json
 * - [1] (our own keybindings), 1, 'deploy', { key: 'deploy' } or a full keybind object ({ commands, actions })
 *
 * @param {*} context - whatever vscode handed to the command
 * @returns {{ keybind?: string, command?: object }}
 */
function parseKeybindContext (context) {
	if (Array.isArray(context)) return parseKeybindContext(context[0])
	if (context == null) return {}

	if (typeof context === 'object') {
		// key/keybind/name are all accepted so the keybindings.json entry can read however the user likes
		const name = [context.key, context.keybind, context.name].find(value => value != null)
		const keybind = name != null ? `${name}` : undefined

		// The whole keybind can live in the users keybindings.json instead of the configuration settings
		if (context.commands || context.actions) return { keybind: keybind || 'keybindings.json', command: context }

		return { keybind }
	}

	return { keybind: `${context}` }
}

// Workspace/folder keybinds override the global ones (Same as the original lookup, just merged so we can list them)
function getAvailableKeybinds (workspaceKey) {
	return { ...keyCommands.global, ...getWorkspaceKeybinds(workspaceKey) }
}

/**
 * - Workspace/folder keybinds hang off of the configuration itself ({ keybinds: { ... } })
 * - Profile keybinds are stored as the keybinds object directly (see profiles.js -> updateProfile)
 */
function getWorkspaceKeybinds (workspaceKey) {
	const configuration = (workspaceKey && keyCommands[workspaceKey]) || {}

	if (configuration.keybinds) return configuration.keybinds

	// No keybinds of its own, so fall back to the profile the configuration uses (or the default profile)
	return getProfileKeybinds(configuration.profile) || getProfileKeybinds('default') || {}
}

function getProfileKeybinds (name) {
	if (!name) return

	const profiles = keyCommands.profiles || {}
	if (profiles[name]) return profiles[name]

	// Only the default/node-version profiles get registered, the rest we look up on the configuration
	const profile = getConfig('profiles', []).find(profile => (profile.name || profile) === name)

	return profile && profile.keybinds
}

function getKeybindCommand (workspaceKey, keybind) {
	return getAvailableKeybinds(workspaceKey)[keybind]
}

async function pickKeybind (workspaceKey) {
	const keybinds = getAvailableKeybinds(workspaceKey)
	const keys = Object.keys(keybinds).sort(sortKeybindNames)

	if (!keys.length) return vscode.window.showErrorMessage('Terminal-Config: No keybinds are configured.')

	const items = keys.map(key => ({
		label: key,
		description: keybinds[key].description || '',
		detail: (keybinds[key].commands || []).join(commandSeperator) || (keybinds[key].actions || []).join(', '),
		keybind: key
	}))

	const picked = await vscode.window.showQuickPick(items, {
		title: 'Terminal-Config: Select a keybind to run',
		matchOnDescription: true,
		matchOnDetail: true
	})

	return picked && { keybind: picked.keybind, command: keybinds[picked.keybind] }
}

// The bound cntrl+shift+[1-9] keybinds first, then everything the user named themselves
function sortKeybindNames (a, b) {
	const numbers = [Number(a), Number(b)]

	if (numbers.every(number => !isNaN(number))) return numbers[0] - numbers[1]
	if (!isNaN(numbers[0])) return -1
	if (!isNaN(numbers[1])) return 1

	return a.localeCompare(b)
}

function getKeybindPath (workspaceKey, folderPaths) {
	return folderPaths[workspaceKey] || Object.values(folderPaths)[0]
}

function getKeybindTerminal (activeTerminal, configurationSettings, keybind, workspaceKey, folderPaths) {
	if (activeTerminal) return activeTerminal

	if (!createTerminalForKeybinds(configurationSettings)) {
		vscode.window.showErrorMessage(`Terminal-Config: No terminal to run keybind '${keybind}' in. (Set createTerminalForKeybindsIfNoTerminal to have one created)`)

		return
	}

	const path = getKeybindPath(workspaceKey, folderPaths)
	const name = configurationSettings.name || workspaceKey || 'keybind-terminal'

	const terminal = vscode.window.createTerminal({ name })

	if (path) terminal.sendText(`cd ${path}`)
	terminal.show()

	return terminal
}


async function useKeyBind(terminal, keybind) {
	if (keybind.actions) for (const action of keybind.actions) await vscode.commands.executeCommand(`terminal-config.${action}`)
	if (keybind.commands && keybind.commands.length) terminal.sendText(keybind.commands.join(commandSeperator))
}
