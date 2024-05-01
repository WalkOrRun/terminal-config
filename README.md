## Basics

- Split may/may not work currently. (Not entirely sure why, but it has to do with how fast the extension gets to that segment).
- VSCode api seems to be failing (making the terminal split) if it takes > 4ms after the initial creation of the first terminal (My machine, haven't tested anywhere else)

- Extension will auto-load terminals based on the folder you load in.
- Will auto look for a set file and make terminals for any folder(s) that contain it.
- Can set specific folders to not create terminals.
- Can have folders create additional terminals
- Can give each terminal a list of commands
- Very Beta (Will have a github repo eventually, currently still in developement.)

- Note (Searches based on folders included in config object and filepathtofind)
- Additional Note, this extension takes a lot of space in your preference folder. :)
- It doesn't follow traditional properties, it's one large object, apologies <3.

- Dynamic Commnads are a thing now.
- in your commands array set the dynamic command to between ::
```json
{
    // This is a dynamic commmand, a terminal will appear and ask you to insert the value for :message:
    "commands": ["git add .", "git commit -m ':message:'", "git push origin @"]
}
```

- Two command as of now can be called from cntrl+shift+p
# - Terminal-Config Run workspace configuration
# - Terminal-Config Rerun workspace configuration (Closes terminals)

### Note, this extensition recursively looks for "fileToFind" Or Folders listed in the preferences settings

```json
// Example Config in Preference: User Settings
// Currently only works in global settings.
// All possible configurations will be in the example
{
    "terminal-config": {
        // NOTE SINCE VSCODE MAY STORE YOUR PREVIOUS TERMINAL CACHE
        // THERE IS A CHANCE DUPLICATED TERMINALS MAY BE OPENED.
        // THIS IS COUNTERED BY DELAYING INITIALIZATION, default is 3 seconds (Adjust accordingly)
        "initialLoadDelay": 5, // Reminder this is in seconds
        // Another issue, it may occur that your terminal(s) are removed, but no terminal is displayed on load or after re-running configuartion
        // There is noa wait on dispose of terminals, so I do a delay of 1 seconds naturally feel free to adjust
        "delayAfterRemovingTerminals": 0.5, // Reminder again this is in seconds
        // Base properties
        // If a new folder/file is found with the fileToFind property, will make a basic configuration
        "addNewTerminalToWorkspace": true,
        // Removes terminals with the same name
        "removeSameNameTerminals": false,
        // Highly recommend just using this one tbh (defaults false) As the name suggests removes all terminals on load
        "removeTerminalsOnLoad": true,
        // Currently ignores node_modules
        // To Add more folders, uses | as a seperator.
        // Expects just a string, don't put an actual regex. uses RegExp(..., 'g')
        "ignoreRegex": "folder|test|lol",
        // Two ways to find a folder, by file or by having it in your config. Regardless this extension will look through all folders loaded.
        // Note if you have nested files this extension will not work as expected. (If there is a case for this I'll make a setting to continue after finding expected configurations)
        "fileToFind": "package.json",
        // Keybinds!!! I allow you to set up to 9 Keybinds!!! (Of course its just for terminal operations :))
        // cntrl+shift+[1-9]
        "globalKeyBinds": {
            // Note actions will not run if commands are not executed
            // Global Keybinds are overidden by folder/workspace keybinds
            "1": {
                "commands": ["npm run serve", "git checkout master", "git pull --rebase"],
                // Only two actions currently
                "actions": ["setKeybindTerminal", "rerunWorkspaceConfig"]
            }
        },
        // For Global, can add property to folder/workspace if you want for the same functionality
        "createTerminalForKeybindsIfNoTerminal": true,
        "profiles": [
            {
                "name": "profile1",
                "commands": ["nvm use 20", "npm run dev"],
                // Please note, projects with a configuration below and has additionalTerminals will override this conifguration
                "additionalTerminals": [
                    {
                        "commands": ["nvm use 20"],
                        "split": true
                    }
                ],
                // There is no logic in place to ensure only 1 has this tag currently so please do your best to maintain until futher releases do checks.
                // Will use this when using projects that have no configuration settings
                // set configuration setting addNewTerminalToWorkspace to false (If you don't want projects getting new entries)
                // set useDefaultProfileOnNewProjects -> false if you don't want this behaivor to happen with projects not in the configuration settings
                "default": true
            }
        ]
        "test": {
            "profile": "profile1"
        }
        // (When loading in a folder, folder(s)|file(s) you want a terminal to open need to be named here)
        // Example (myproject is some folder you will have load in either as a subfolder or a main folder.) - FOLDER must exist in editor files otherwise this will not find it.
        "myproject": {
            // Name of the terminal, defaults too folder name or file name.
            "name": "myproject",
            // An array of additionalTerminals, has all the same commands, besides: keybinds, keybindTerminal, dontCreateTerminal, createTerminalForKeybindsIfNoTerminal
            // Some small notes, currently requires an array of objects, please include at least one variable in the object
            // Eventually will be able to use a number as well :)
            "additionalTerminals": [],
            // As the name sugjests, event if the terminal already exists it will create another of it
            "alwaysCreateTerminal": true,
            // Closes after sending commands
            "autoClose": true,
            // Add a delay to closing a terminal, milliseconds, default is 100
            "autoCloseDelay": 10000,
            // Array of commands to send to the terminal
            "commands": ["nvm use 18", "cd ./src", "npm run serve"],
            // If you have a folder you don't want a terminal for
            "dontCreateTerminal": false,
            // Name of the terminal you want to use for keybinds. (Ideally will match a name in base config or additionalTerminals, else will show an error message of not found when trying trying to run commands)
            "keybindTerminal": "ffmpeg-node (1)",
            // If terminal is not found to avoid error message or not working, you can have it create a new terminal!
            "createTerminalForKeybindsIfNoTerminal": true,
            // Same as global key binds, (These override global)
            "keybinds": { "3": { "commands": ["cd ../tests", "ffmpeg -i test.png test.jpg", "node test.js"] } },
            // I mean maybe for additional terminals you want to run a different project?
            "path": "C://users/..."
        }
    }
}
```