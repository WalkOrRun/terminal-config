const vscode = require('vscode')

let config = {}

module.exports = {
    getConfig,
    refreshConfig,
    addNewProjectToConfigurations
}

function getConfig (type, defaultValue = false) {
    const result = config.get(type)

    return result != null ? result : defaultValue
}

function refreshConfig () { config = vscode.workspace.getConfiguration('terminal-config') }

function addNewProjectToConfigurations(baseName, useDefaultProfile, name) {
	const profile = useDefaultProfile ? name : false
	const workspace = vscode.workspace.getConfiguration()
	const terminal = workspace.get('terminal-config')

	const baseConfig = { ...terminal, [baseName]: { name: baseName } }

	if (profile) baseConfig[baseName].profile = profile

	workspace.update('terminal-config', baseConfig, vscode.ConfigurationTarget.Global)
	vscode.window.showInformationMessage(`Terminal-Config: Added ${baseName} to configuration. ${profile && ` Profile: ${profile}`}`)
	refreshConfig()
}
