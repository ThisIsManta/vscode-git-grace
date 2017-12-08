import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as os from 'os'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as process from 'process'
import * as open from 'open'

import TortoiseGit from './TortoiseGit'

let chan: vscode.OutputChannel

export function activate(context: vscode.ExtensionContext) {
    chan = vscode.window.createOutputChannel('Git Grace')

    const gitPath = vscode.workspace.getConfiguration('git').get<string>('path') || (os.platform() === 'win32' ? 'C:/Program Files/Git/bin/git.exe' : 'git')
    const git = (rootLink: vscode.Uri, ...parameters: Array<string>): Promise<string> => new Promise((resolve, reject) => {
        chan.appendLine('git ' + parameters.join(' '))

        const pipe = cp.spawn(gitPath, parameters, {
            cwd: rootLink.fsPath.replace(new RegExp(_.escapeRegExp(fp.win32.sep), 'g'), fp.posix.sep),
        })

        let errorBuffer = ''
        pipe.stderr.on('data', text => {
            errorBuffer += String(text)
            chan.append(String(text))
        })

        let outputBuffer = ''
        pipe.stdout.on('data', text => {
            outputBuffer += String(text)
            chan.append(String(text))
        })

        pipe.on('close', exit => {
            chan.appendLine('')

            if (exit === 0) {
                resolve(outputBuffer)
            } else {
                reject(errorBuffer)
            }
        })
    })

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.fetch', async () => {
        const rootList = getTotalFolders()
        if (rootList.length === 0) {
            return null
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Fetching...' }, async (progress) => {
            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Fetching "${root.name}"...` })
                }

                try {
                    await retry(2, () => git(root.uri, 'fetch', '--prune', 'origin'))

                } catch (ex) {
                    await showError(`Git Grace: Fetching "${root.name}" failed.`)
                    return null
                }
            }
        })

        vscode.window.setStatusBarMessage(`Fetching completed`, 5000)

        vscode.commands.executeCommand('git.refresh')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pull', async () => {
        const rootList = getTotalFolders()

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pulling...' }, async (progress) => {
            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Pulling "${root.name}"...` })
                }

                try {
                    await retry(2, () => git(root.uri, 'pull', '--ff-only', 'origin'))

                } catch (ex) {
                    await showError(`Git Grace: Pulling "${root.name}" failed.`)
                    return null
                }
            }
        })

        vscode.window.setStatusBarMessage(`Pulling completed`, 5000)

        vscode.commands.executeCommand('git.refresh')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.push', async () => {
        const rootList = getTotalFolders()
        if (rootList.length === 0) {
            return null
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pushing...' }, async (progress) => {
            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Pushing "${root.name}"...` })
                }

                try {
                    const status = await git(root.uri, 'status', '--short', '--branch')
                    let branch = status.split('\n')[0].substring(3).trim()
                    if (branch.includes('...')) {
                        branch = branch.substring(0, branch.indexOf('...'))
                    }

                    if (branch.includes('(no branch)')) {
                        return vscode.window.showErrorMessage(`Git Grace: No branch was found.`)
                    }

                    try {
                        await git(root.uri, 'push', '--verbose', '--tags', 'origin', branch)

                    } catch (ex) {
                        if (String(ex).includes('hint: Updates were rejected because the tip of your current branch is behind')) {
                            const pickButton = await vscode.window.showWarningMessage(`Git Grace: The branch on repository "${root.name}" could not be pushed because it was out-dated.`,
                                ...([{ title: 'Force Pushing' }, { title: 'Cancel', isCloseAffordance: true }] as Array<vscode.MessageItem>))
                            if (pickButton && pickButton.title === 'Force Pushing') {
                                await git(root.uri, 'push', '--verbose', '--tags', '--force-with-lease', 'origin', branch)
                            }

                            return null

                        } else {
                            throw ex
                        }
                    }

                } catch (ex) {
                    await showError(`Git Grace: Pushing "${root.name}" failed.`)
                    return null
                }
            }
        })

        vscode.window.setStatusBarMessage(`Pushing completed`, 5000)

        vscode.commands.executeCommand('git.refresh')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.branch', async () => {
        const root = await getSingleFolder()
        if (!root) {
            return null
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Branching...' }, async (progress) => {
            try {
                const [noUse, branch] = await Promise.all([
                    retry(1, () => git(root.uri, 'fetch', '--prune', 'origin')),
                    vscode.window.showInputBox({
                        placeHolder: 'Branch name',
                        prompt: 'Please provide a branch name (Press \'Enter\' to confirm or \'Escape\' to cancel)',
                        ignoreFocusOut: true
                    }),
                ])

                if (!branch) {
                    return null
                }

                const sanitizedBranchName = branch.replace(/\\/g, '/').split('/').map(_.kebabCase).join('/')
                await git(root.uri, 'checkout', '-b', sanitizedBranchName, '--no-track', 'origin/master')

            } catch (ex) {
                await showError(`Git Grace: Branching failed.`)
                return null
            }
        })

        vscode.commands.executeCommand('git.refresh')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.open', async () => {
        const gitPattern = /^\turl\s*=\s*git@(.+)\.git/
        const urlPattern = /^\turl\s*=\s*(.+)\.git$/
        const list = getTotalFolders()
            .map(root => {
                const path = fp.join(getGitPath(root.uri), '.git', 'config')
                if (!fs.existsSync(path)) {
                    return null
                }

                const file = fs.readFileSync(path, 'utf-8')
                const lines = _.compact(file.split('\n'))
                let head = ''
                const dict = new Map<string, string>()
                for (const line of lines) {
                    if (line.startsWith('[')) {
                        head = line
                    } else if (gitPattern.test(line)) {
                        dict.set(head, 'https://' + line.match(gitPattern)[1].replace(':', '/'))
                    } else if (urlPattern.test(line)) {
                        dict.set(head, line.match(urlPattern)[1])
                    }
                }

                if (dict.has('[remote "origin"]') === false) {
                    return null
                }

                return dict.get('[remote "origin"]')
            })
            .filter(url => url !== null)

        if (list.length === 0) {
            return null
        }

        if (list.length === 1) {
            open(list[0])
            return null
        }

        const pick = await vscode.window.showQuickPick(list)
        if (pick) {
            open(pick)
            return null
        }
    }))

    const tortoiseGit = new TortoiseGit(getWorkingFile, getSingleFolder, getGitPath)
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.showLog', () => tortoiseGit.showLog()))
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.showFileLog', () => tortoiseGit.showFileLog()))
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.commit', () => tortoiseGit.commit()))
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.blame', () => tortoiseGit.blame()))
}

export function deactivate() {
    if (chan) {
        chan.dispose()
    }
}

function getWorkingFile() {
    if (!vscode.window.activeTextEditor) {
        vscode.window.showErrorMessage(`This command requires a file to be opened.`)
        return null
    }

    if (getGitPath(vscode.window.activeTextEditor.document.uri) === null) {
        vscode.window.showErrorMessage(`This command requires the current file to be in Git repository.`)
        return null
    }

    return vscode.window.activeTextEditor.document.uri
}

async function getSingleFolder() {
    const rootList = getTotalFolders()
    if (rootList.length === 0) {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage(`This command requires a folder to be opened.`)
            return null

        } else {
            vscode.window.showErrorMessage(`This command requires the current folder to be in Git repository.`)
            return null
        }
    }

    if (vscode.workspace.workspaceFolders.length === 1 && rootList.length === 1) {
        return rootList[0]
    }

    if (vscode.window.activeTextEditor) {
        const workFolder = rootList.find(root => root.uri.fsPath === vscode.window.activeTextEditor.document.uri.fsPath)
        if (workFolder) {
            return workFolder
        }
    }

    const pickItem = await vscode.window.showQuickPick(rootList.map(item => item.name))
    if (!pickItem) {
        return null
    }

    return rootList.find(item => pickItem === item.name)
}

function getTotalFolders() {
    return (vscode.workspace.workspaceFolders || []).filter(root => !!getGitPath(root.uri))
}

function getGitPath(link: vscode.Uri) {
    if (!link) {
        return null
    }

    const pathList = link.fsPath.split(/\\|\//)
    for (let rank = pathList.length; rank > 0; rank--) {
        const path = fp.join(...pathList.slice(0, rank), '.git')
        if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
            return fp.dirname(path)
        }
    }

    return null
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

async function showError(message: string) {
    if (await vscode.window.showErrorMessage(message, 'Show Log') === 'Show Log') {
        chan.show()
    }
}
