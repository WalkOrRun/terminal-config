const execSync = require('child_process').execSync

const { safe } = require('./utils')

module.exports = {
    commandSeperator: getCommandSeperator(),
    hasChildProcess: hasChildProcess()
}

function getCommandSeperator () {
    switch (process.platform) {
        case 'win32': return '; '
        case 'linux': return ' && '
    }
}

function hasChildProcess() {
    switch (process.platform) {
        case 'win32': return windowsHasChildProcesses
        case 'linux': return linuxHasChildProcesses
    }
}

function linuxHasChildProcesses (pid) {
    return safe(() => execSync(`cat /proc/${pid}/task/${pid}/children`).toString().trim() !== '')
}

function windowsHasChildProcesses (pid) {
    return safe(() => {
        const result = execSync(`wmic process where (ParentProcessId=${pid}) get ProcessId`)

        return result.toString().trim() !== ''
    })
}
