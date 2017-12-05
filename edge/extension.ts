import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as os from 'os'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as process from 'process'

// const Git = require('simple-git')
let chan: vscode.OutputChannel

export function activate(context: vscode.ExtensionContext) {
    chan = vscode.window.createOutputChannel('Git Grace')

    const gitPath = vscode.workspace.getConfiguration('git').get<string>('path') || (os.platform() === 'win32' ? 'C:/Program Files/Git/bin/git.exe' : 'git')
    const git = (rootLink: vscode.Uri, ...parameters: Array<string>): Promise<void> => new Promise((resolve, reject) => {
        chan.appendLine('git ' + parameters.join(' '))

        const pipe = cp.spawn(gitPath, parameters, {
            cwd: rootLink.fsPath.replace(new RegExp(_.escapeRegExp(fp.win32.sep), 'g'), fp.posix.sep),
        })

        pipe.stderr.on('data', text => {
            chan.append(String(text))
        })

        pipe.stdout.on('data', text => {
            chan.append(String(text))
        })

        pipe.on('close', exit => {
            chan.appendLine('')

            if (exit === 0) {
                resolve()
            } else {
                reject()
            }
        })
    })

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.fetch', async () => {
        const rootList = getTotalRootFolders()

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Fetching...' }, async (progress) => {
            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Fetching "${root.name}"...` })
                }

                try {
                    await retry(1, () => git(root.uri, 'fetch', '--prune', 'origin'))

                } catch (ex) {
                    vscode.window.showErrorMessage(`Git Grace: Fetching "${root.name}" failed.`)
                    return null
                }
            }

            vscode.window.setStatusBarMessage(`Fetching completed`, 5000)
        })
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pull', async () => {
        const rootList = getTotalRootFolders()

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pulling...' }, async (progress) => {
            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Pulling "${root.name}"...` })
                }

                try {
                    await retry(1, () => git(root.uri, 'pull', '--ff-only', 'origin'))

                } catch (ex) {
                    vscode.window.showErrorMessage(`Git Grace: Pulling "${root.name}" failed.`)
                    return null
                }
            }

            vscode.window.setStatusBarMessage(`Pulling completed`, 5000)
        })
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.branch', async () => {
        const root = await getSingleRootFolder()
        if (!root) {
            return null
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Branching...' }, async (progress) => {
            try {
                const [noUse, branch] = await Promise.all([
                    retry(1, () => git(root.uri, 'fetch', '--prune', 'origin')),
                    vscode.window.showInputBox({ placeHolder: 'Create new branch', ignoreFocusOut: true }),
                ])

                if (!branch) {
                    return null
                }

                await git(root.uri, 'checkout', '-B', branch.replace(/\\/g, '/').split('/').map(_.kebabCase).join('/'), '--track', 'origin/master')

            } catch (ex) {
                vscode.window.showErrorMessage(`Git Grace: Branching failed.`)
                return null
            }
        })
    }))
}

export function deactivate() {
    if (chan) {
        chan.dispose()
    }
}

async function getSingleRootFolder() {
    const rootList = getTotalRootFolders()
    if (rootList.length === 0) {
        return null
    }

    if (rootList.length === 1) {
        return rootList[0]
    }

    const pickItem = await vscode.window.showQuickPick(rootList.map(item => item.name))
    if (!pickItem) {
        return null
    }

    return rootList.find(item => pickItem === item.name)
}

function getTotalRootFolders() {
    return (vscode.workspace.workspaceFolders || [])
        .filter(root => fs.existsSync(fp.join(root.uri.fsPath, '.git')))
}

async function retry<T>(count: number, action: () => Promise<T>): Promise<T> {
    while (true) {
        try {
            return await action()

        } catch (ex) {
            if (count > 0) {
                count -= 1
                await sleep(1500)
                continue
            }

            throw ex
        }
    }
}

async function sleep(time: number) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, time)
    })
}