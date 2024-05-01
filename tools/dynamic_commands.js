const vscode = require('vscode')
const fs = require('fs')
const path = require('path')

const { safe, sleep } = require('./utils')
const { watchFile } = require('./files')
const { getConfig } = require('./config')
const { getTerminalByPID } = require('./vscode')
const { commandSeperator } = require('./process')

const baseDir = `${__dirname}/..`

module.exports = {
    handleDynamicCommands
}

async function handleDynamicCommands(commands, terminal) {
	// No commands to use
	if (!commands || !commands.length) return

	const dynamicCommands = commands.map((command, index) => {
		return command.commands.map((newCommand, commandIndex) => {
			return mapDynmaicCommandToPopup(newCommand, commandIndex, index, command)
		})
	}).flat().flat()

	const formattedCommands = dynamicCommands.reduce(mapCommandsToBaseCommand, {})
	const file = await buildJSONFile(formattedCommands)

	const previouslyActiveTerminal = vscode.window.activeTerminal
	

	// Maybe make this an option in the future, wasn't a fan of it tbb. Can be misleading and breaks if the user runs a process with in the active terminal
	// const activeTerminal = vscode.window.activeTerminal
	// const activeChildProcess = await hasChildProcess((await activeTerminal.processId).toString())

	const dynamicCommandsTermianl = terminal || vscode.window.createTerminal({ name: 'Dynamic Commands', color: 'blue' })

	dynamicCommandsTermianl.show()

	dynamicCommandsTermianl.sendText(`node ${baseDir}/dynamic_commands.js ${file}`)

	const filePath = path.join(baseDir, 'files', file)

	const watcher = await watchFile(filePath)
    // Need some delay, the file isn't always ready to be read (Will need feedback eventually)
    await sleep(0.01)
	await safe(() => handleResults(filePath, watcher, commands, dynamicCommandsTermianl))
	// Always close the terminal
	if (!terminal) setTimeout(() => dynamicCommandsTermianl.dispose(), 5000)

	await safe(() => fs.promises.rm(filePath))
	if (previouslyActiveTerminal) await safe(() => previouslyActiveTerminal.show())
}


/**
 * @param {vscode.Terminal} dynamicCommandsTermianl
 */
async function handleResults (filePath, watcher, commands) {
	if (!watcher || !watcher.success) return Promise.reject({ message: 'File watcher failed', watcher })
    // Node allows you to require JSON files, and they will be automatically parsed
	const parsed = require(filePath)

	if (!parsed.results) return Promise.reject('No results found')

	const results = parsed.results
    const formattedCommands = formatDynamicCommandResults(commands, results)

	for (const command of formattedCommands) {
		const terminal = await getTerminalByPID(command.terminalInformation.pid, command.baseFolder, command.terminalInformation.name)

		terminal.sendText(command.commands)
	}

	vscode.window.showInformationMessage('Dynamic Commands have been sent to the terminal(s)')
}

async function buildJSONFile (commands) {
	const fileName = new Array(40).fill('').map(() => String.fromCharCode(Math.floor(Math.random() * 26) + 97)).join('') + '.json'
	const jsonObject = {
		questions: commands,
		date: new Date().getTime(),
		activeTerminal: (await vscode.window.activeTerminal.processId).toString()
	}
	await fs.promises.writeFile(path.join(baseDir, 'files', fileName), JSON.stringify(jsonObject, null, 2))

	return fileName
}

function mapCommandsToBaseCommand(prev, arg) {
	if (!arg) return prev
	const baseCommand = arg.baseCommand

	if (!prev[baseCommand]) prev[baseCommand] = []

	prev[baseCommand].push(arg)

	return prev
}

function mapDynmaicCommandToPopup(command, commandIndex, baseIndex, baseCommandObj) {
	const { terminalInformation, terminalName, baseFolder, profileName } = baseCommandObj
	const dynamicCommandsRegex = /:[\s\S]*?:/g
	const newCommands = command.match(dynamicCommandsRegex)

	if (newCommands) {
		return newCommands.map((newCommand, index) => {
			const description = getDynamicCommandDescription(newCommand.replaceAll(':', ''), terminalName, profileName)

			return {
				label: description,
				commandIndex: baseIndex,
				dynamicCommandsIndex: commandIndex,
				newCommandIndex: index,
				baseFolder,
				command: newCommand,
				baseCommand: command,
				terminalInformation
			}
		})
	}
}

function getDynamicCommandDescription(newCommand, baseFolder, profileName) {
	let config = getConfig(baseFolder, {})
	if (!config.dynamicCommands) config = getConfig(profileName, {})
	if (!config.dynamicCommands) config = getConfig('dynamicCommands', {})
	if (config.dynamicCommands) config = config.dynamicCommands

	return config[newCommand] || newCommand
}

function formatDynamicCommandResults (commands, results) {

	// First build terminal commands. via && and then send them to the terminal
	// This is unfortunately a mess, but hey it is what it is :)
	return commands.map(baseCommand => {
		baseCommand.commands = baseCommand.commands.map(command => {
			if (results[command]) {
				for (const reply of results[command]) {
					const answer = reply.answer
					const label = reply.command.label

					command = command.replace(`:${label}:`, answer)
				}
			}

			return command
		}).join(commandSeperator)

		return baseCommand
	})
}