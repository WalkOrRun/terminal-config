// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode')
const path = require('path')
const fs = require('fs')

const { refreshConfig, getConfig, addNewProjectToConfigurations } = require('./tools/config')
const { setGlobalKeyBinds, setLocalKeyBinds, handleKeyBinds } = require('./tools/keybinds')
const { safe, sleep, clone } = require('./tools/utils')
const { findBaseFolders, removeDatedFiles } = require('./tools/files')
const { setDefaultProfiles, getProfile, getProfileKey } = require('./tools/profiles')
const { handleDynamicCommands } = require('./tools/dynamic_commands')
const { commandSeperator } = require('./tools/process')

refreshConfig()

const terminalsHash = {}
const folderPaths = {}


/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	if (!fs.existsSync(path.join(__dirname, 'files'))) fs.mkdirSync(path.join(__dirname, 'files'))
	const handleWorkspaceTerminal = vscode.commands.registerCommand('terminal-config.openTerminal', () => {
		safe(openWorkSpaceTerminals)
	})

	const rerunWorkSpaceTerminals = vscode.commands.registerCommand('terminal-config.rerunWorkspaceConfig', () => {
		// Remove all terminals
		vscode.window.terminals.forEach(terminal => terminal.dispose())
		safe(openWorkSpaceTerminals)
	})

	const setKeybindTerminal = vscode.commands.registerCommand('terminal-config.setKeybindTerminal', async () => {
		const result = await vscode.window.showQuickPick(vscode.window.terminals.map(terminal => terminal.name))
		if (!result) return
	})

	const refreshKeybinds = vscode.commands.registerCommand('terminal-config.reloadKeybinds', async () => {
		setGlobalKeyBinds()
		setDefaultProfiles()
		setLocalKeyBinds(terminalsHash)
	})

	const onConfgChange = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('terminal-config')) {
			refreshConfig()

			// Rebuild keybinds
			setGlobalKeyBinds()
			setDefaultProfiles()
			setLocalKeyBinds(terminalsHash)

			vscode.window.showInformationMessage('Terminal config has been updated!')
		}
	})

	const handleKeyBind = vscode.commands.registerCommand('terminal-config.opencommand', async context => await safe(() => handleKeyBinds(context, folderPaths, terminalsHash)))

	context.subscriptions.push(handleWorkspaceTerminal, rerunWorkSpaceTerminals, onConfgChange, handleKeyBind, setKeybindTerminal, refreshKeybinds)

	// Sleep on initial load
	await sleep(getConfig('initialLoadDelay', 1.75))
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	
	safe(removeDatedFiles)
	setDefaultProfiles()
	setGlobalKeyBinds()
	await safe(openWorkSpaceTerminals)
}

// This method is called when your extension is deactivated
function deactivate() {}

async function openWorkSpaceTerminals () {
	if (getConfig('removeTerminalsOnLoad')) {
		for (const terminal of vscode.window.terminals) terminal.dispose()
		await sleep(getConfig('delayAfterRemovingTerminals') || 1)
	}

	const results = []
	for (const folder of vscode.workspace.workspaceFolders) results.push(await createTerminals(folder))

	const flattendResults = results.flat().flat()

	const commands = flattendResults.filter(result => result && result.commands)

	setLocalKeyBinds(terminalsHash)

	await handleDynamicCommands(commands)
}


async function createTerminals (folder) {
	const { baseFolders, terminalHash } = getFolderConfigurations(folder)

	const results = []

	for (const baseFolder of baseFolders) {
		const { config, terminalName } = getBaseTerminalConfigation(baseFolder)
		// Results may hold { commands, terminalID, terminal }
		results.push(await handleTerminalOperations(config, terminalName, null, terminalHash, baseFolder))
		// const additionalTerminalsResults = await handleAdditionalTerminals(config, baseFolder, terminalHash, baseResults.terminalInformation.pid, terminalName)
	}

	return results.flat()
}

function getFolderConfigurations(folder) {
	const terminalCommands = getConfig(folder.name, {})

	const filetofind = terminalCommands.fileToFind || getConfig('fileToFind', 'package.json')
	const baseFolders = findBaseFolders(folder.uri.fsPath, filetofind) || []
	const terminalHash = vscode.window.terminals.reduce((prev, terminal) => ({ ...prev, [terminal.name]: true }), {})

	return { baseFolders, terminalHash }
}

function getBaseTerminalConfigation(baseFolder) {
	const terminalName = path.basename(baseFolder)

	const useDefaultProfileOnNewProject = getConfig('useDefaultProfileOnNewProjects', true) !== false
	const config = clone(getConfig(terminalName, (useDefaultProfileOnNewProject && getProfile('default')) || {}))
	let profile = config.profile ? getConfig('profiles').find(profile => profile.name === config.profile) : false

	if (config.profile && !profile) vscode.window.showErrorMessage(`${terminalName}, in configuration is using profile: ${config.profile}, but profile does not exist.`)
	if (getConfig('addNewTerminalToWorkspace') && !getConfig(terminalName)) addNewProjectToConfigurations(terminalName, useDefaultProfileOnNewProject, getProfileKey('default', 'name'))

	if (profile) {
		// Make sure we don't change our object in memory
		profile = clone(profile)
		profile.name = config.name || terminalName
		if (config.additionalTerminals) profile.additionalTerminals = config.additionalTerminals
	} else if (!getConfig(terminalName)) config.name = terminalName

	return { config: profile || config, terminalName }
}

async function handleAdditionalTerminals(config, baseFolder, terminalHash, parentTerminal, terminalName) {
	if (!config.additionalTerminals) return []

	const promises = config.additionalTerminals.map(async (configuration, index) => {
		const baseName = `${terminalName}(${index + 1})`

		let profile = configuration.profile ? getConfig('profiles').find(profile => profile.name === configuration.profile) : false
		if (configuration.profile && !profile) vscode.window.showErrorMessage(`Terminal Config: Additional terminal for configuration key: ${terminalName}, has profile set to: ${configuration.profile}, but this profile does not exist`)

		if (profile) {
			// Make sure that our object from 'config' doesn't get overriden.
			profile = clone(profile)
			profile.split = configuration.split
			profile.name = configuration.name || baseName
		} else if (config.profile) configuration.name = baseName
		else if (!configuration.name) configuration.name = baseName

		return handleTerminalOperations(profile || configuration, terminalName, index, terminalHash, baseFolder, parentTerminal, true)
	})

	const results = (await Promise.all(promises)).flat()

	return results.reduce((acc, cur) => {
		if (cur && cur.commands) acc.push(cur)

		return acc
	}, [])
}

async function checkConfiguration (configuration, terminalName, terminalHash) {
	if (configuration.dontCreateTerminal) return

	if (terminalHash[terminalName]) {
		if (configuration.removeSameNameTerminals || getConfig('removeSameNameTerminals') || getConfig('removeTerminalsOnLoad')) {
			for (const terminal of vscode.window.terminals) {
				if (terminal.name === terminalName) {
					terminal.dispose()
					break
				}
			}
			await sleep(getConfig('delayAfterRemovingTerminals') || 1)
		}
		else if (!configuration.alwaysCreateTerminal) return
	}

	return true
}

/**
 * - Creates a terminal if it doesn't exist (or if alwaysCreateTerminal is true Or if removeSameNameTerminals is true)
 * 
 * @param {*} config - config for the terminal
 * @param {*} baseName - the base name of the terminal
 * @param {*} index - the index of the terminal
 * @param {*} terminalHash - a hash of all the terminal names
 * @param {*} baseFolder - the base folder of the terminal
 * @returns 
 */
async function handleTerminalOperations (configuration, baseName, index, terminalHash, baseFolder, parentTerminal, skipConfigCheck = false) {
	const results = []
	if (configuration.dontCreateTerminal) return

	const terminalName = configuration.name || `${baseName}${index ? `-${index}` : ''}`
	if (!skipConfigCheck && !(await checkConfiguration(configuration, terminalName, terminalHash))) return []

	// Basename is the folder name/package name so if we want to use keybinds we can do it this way easier :)
	terminalsHash[terminalName] = baseName

	const terminal = parentTerminal && configuration.split
		? vscode.window.createTerminal({ name: terminalName, location: { parentTerminal } })
		: vscode.window.createTerminal(terminalName)

	const isActiveTerminal = vscode.window.activeTerminal

	if (configuration.show || !isActiveTerminal) terminal.show()

	// Set the terminal to the base folder (or the folder specified in the configuration)
	terminal.sendText(`cd ${configuration.path || baseFolder}`)
	const additionaTerminals = await handleAdditionalTerminals(configuration, baseFolder, terminalHash, terminal, baseName)
	if (additionaTerminals.length) results.push(...additionaTerminals)

	if (!configuration.commands) configuration.commands = []

	const dynamicCommandsRegex = /:[\s\S]*:/
	const dynamicCommands = configuration.commands.some(command => dynamicCommandsRegex.test(command))

	if (!dynamicCommands && configuration.commands.length) {
		const commands = configuration.commands.join(commandSeperator)
		terminal.sendText(commands)
	}

	if (configuration.autoClose) {
		setTimeout(() => {
			terminal.dispose()
		}, configuration.autoCloseDelay || getConfig('autoCloseDelay', 100))
	}

	const terminalInformation = {
		name: terminalName,
		pid: (await terminal.processId).toString()
	}

	results.unshift({ commands: dynamicCommands && configuration.commands, terminalName, baseFolder, terminalInformation })

	return results
}

module.exports = {
	activate,
	deactivate
}