const fs = require('fs')
const path = require('path')
const readline = require('readline')

main()

async function main () {
    const fileExists = process.argv[2]
    const filePath = path.join(__dirname, 'files', fileExists || '')
    try {
        if (!fileExists) throw new Error('No file provided')

        const file = await fs.promises.readFile(filePath, 'utf8')

        const parsed = JSON.parse(file)

        const terminal = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        const results = {}

        const totalCommands = Object.keys(parsed.questions).reduce((acc, key) => acc + parsed.questions[key].length, 0)
        const totalBaseCommands = Object.keys(parsed.questions).length

        terminal.write(`\x1b[32mWelcome to the Dynamic Command Line Interface\n`)
        terminal.write(`There are ${totalCommands} commands to complete\x1b[0m\n`)
        terminal.write(`\x1b[94mPlease provide information for the following Dynamic base command(s) Total: ${totalBaseCommands}\x1b[0m`)

        let index = 0

        for (const key in parsed.questions) {
            terminal.write(`\n\nBase Command: \x1b[36m${key} \x1b[0m\n`)
            results[key] = []
            for (const command of parsed.questions[key]) {
                const answer = await askQuestion(terminal, `${index + 1}) Terminal: \x1b[31m${command.terminalInformation.name}\x1b[0m Dynamic Command: \x1b[35m${command.command}\x1b[0m `)

                results[key].push({
                    command,
                    answer
                })

                index++
            }
        }

        terminal.write(`\n\x1b[35mPreparing to send ${totalCommands} command(s)\x1b[0m\n`)
        
        parsed.results = results
        
        terminal.write(`\n\n\x1b[32mThank you for using terminal-config Dynamic Commands!\nThis terminal will remove itself in 5 seconds :)\x1b[0m\n`)
        terminal.close()
        await fs.promises.writeFile(filePath, JSON.stringify(parsed, null, 2))
    
        
        
    } catch (error) {
        await fs.promises.writeFile(filePath, JSON.stringify({ error: error.message }))
    } finally {
        process.exit(0)
    }
}

async function askQuestion (terminal, question) {
    return new Promise(resolve => {
        terminal.question(question, answer => resolve(answer))
    })
}
