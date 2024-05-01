const { getConfig } = require('./config')
const { safe } = require('./utils')
const { setKeybind } = require('./keybinds')

// Just like keybinds might be easier if everything was a class?
const defaultProfiles = {}

module.exports  = {
    setDefaultProfiles,
    updateProfile,
    getProfile,
    getProfileKey
}

function setDefaultProfiles() {
	const profiles = getConfig('profiles', [])

	profiles.forEach(profile => {
		if (profile.default) updateProfile('default', profile)
		else if (profile['node-version']) updateProfile('node-' + profile['node-version'], profile)
	})
}

function updateProfile (name, profile) {
    const keybinds = profile.keybinds

    if (keybinds) setKeybind({ key: name, value: keybinds, baseKey: 'profiles' })

    defaultProfiles[name] = profile
}

function getProfile (name) {
    return defaultProfiles[name]
}

function getProfileKey (name, key) {
    return safe(() => defaultProfiles[name][key])
}