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

    const getCurrentBranchStatus = async (link: vscode.Uri) => {
        const status = await git(link, 'status', '--short', '--branch')
        const branch = status.split('\n')[0].substring(3).trim()

        if (branch.includes('(no branch)')) {
            return null
        }

        let local = branch
        let remote = ''
        let distance = 0
        if (branch.includes('...')) {
            const separator = branch.indexOf('...')
            local = branch.substring(0, separator)
            remote = branch.substring(separator + 3).trim()

            if (/\[(ahead|behind)\s\d+\]/.test(remote)) {
                distance = parseInt(branch.match(/\[(ahead|behind)\s(\d+)\]/)[2])
                if (/\[behind\s\d+\]/.test(remote)) {
                    distance *= -1
                }
                remote = remote.substring(0, remote.indexOf('[')).trim()
            }
        }

        return { local, remote, distance }
    }

    const getRemoteBranchNames = async (link: vscode.Uri) => {
        const content = await git(link, 'branch', '--list', '--remotes')
        return _.chain(content.split('\n'))
            .map(line => line.trim())
            .map(line => line.split(' -> '))
            .flatten()
            .compact()
            .value()
    }

    const getLastCommit = async (link: vscode.Uri) => {
        const result = await git(link, 'log', '--max-count', '1', '--format=oneline')
        return {
            sha1: result.substring(0, result.indexOf(' ')).trim(),
            message: result.substring(result.indexOf(' ') + 1).trim().split('\n')[0],
        }
    }

    const gitPattern = /^\turl\s*=\s*git@(.+)\.git/
    const urlPattern = /^\turl\s*=\s*(.+)\.git$/

    const getRepositoryList = async () => {
        const rootList = getTotalFolders()
        const repoList: Array<{ root: vscode.WorkspaceFolder, http: string, path: string }> = []
        for (const root of rootList) {
            const gitfPath = getGitFolder(root.uri)
            const confPath = fp.join(gitfPath, '.git', 'config')
            if (!fs.existsSync(confPath)) {
                continue
            }

            const confFile = fs.readFileSync(confPath, 'utf-8')
            const confLine = _.compact(confFile.split('\n'))
            let head = ''
            const dict = new Map<string, string>()
            for (const line of confLine) {
                if (line.startsWith('[')) {
                    head = line
                } else if (gitPattern.test(line)) {
                    dict.set(head, 'https://' + line.match(gitPattern)[1].replace(':', '/'))
                } else if (urlPattern.test(line)) {
                    dict.set(head, line.match(urlPattern)[1])
                }
            }

            let http = dict.get('[remote "origin"]')
            if (http === undefined) {
                continue
            }

            repoList.push({ root, http, path: gitfPath })
        }
        return repoList
    }

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.fetch', async () => {
        const rootList = getTotalFolders()
        if (rootList.length === 0) {
            return null
        }

        let repoGotUpdated = false

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Fetching...' }, async (progress) => {
            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Fetching "${root.name}"...` })
                }

                try {
                    const result = await retry(2, () => git(root.uri, 'fetch', '--prune', 'origin'))
                    if (result.trim().length > 0) {
                        repoGotUpdated = true
                    }

                } catch (ex) {
                    await showError(`Git Grace: Fetching "${root.name}" failed.`)
                    return null
                }
            }
        })

        if (repoGotUpdated) {
            vscode.commands.executeCommand('git.refresh')

        } else {
            vscode.window.showInformationMessage(`Git Grace: There were no updates.`)
        }

        vscode.window.setStatusBarMessage(`Fetching completed`, 5000)
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

        let repoGotUpdated = false

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pushing...' }, async (progress) => {
            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Pushing "${root.name}"...` })
                }

                const status = await getCurrentBranchStatus(root.uri)
                if (status === null) {
                    return vscode.window.showErrorMessage(`Git Grace: The current repository was not attached to any branches.`)
                }

                const branch = status.local
                try {
                    const result = await git(root.uri, 'push', '--verbose', '--tags', 'origin', branch)
                    if (result.trim() !== 'Everything up-to-date') {
                        repoGotUpdated = true
                    }

                } catch (ex) {
                    if (String(ex).includes('hint: Updates were rejected because the tip of your current branch is behind')) {
                        const options: Array<vscode.MessageItem> = [{ title: 'Force Pushing' }, { title: 'Cancel', isCloseAffordance: true }]
                        const select = await vscode.window.showWarningMessage(
                            `Your branch on repository "${root.name}" could not be pushed because its remote branch was out-of-sync.`,
                            { modal: true }, ...options)
                        if (select === options[0]) {
                            await git(root.uri, 'push', '--verbose', '--tags', '--force-with-lease', 'origin', branch)
                        }

                        return null

                    } else {
                        await showError(`Git Grace: Pushing "${root.name}" failed.`)
                        return null
                    }
                }
            }
        })

        if (repoGotUpdated) {
            vscode.commands.executeCommand('git.refresh')

        } else {
            vscode.window.showInformationMessage(`Git Grace: There were no updates.`)
        }

        vscode.window.setStatusBarMessage(`Pushing completed`, 5000)
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitAmend', async () => {
        const root = await getSingleFolder()
        if (!root) {
            return null
        }

        const commit = await getLastCommit(root.uri)

        const options: Array<vscode.MessageItem> = [{ title: 'Amend Last Commit' }, { title: 'Cancel', isCloseAffordance: true }]
        const select = await vscode.window.showWarningMessage(
            `Are you sure you want to amend last commit "${_.truncate(commit.message, { length: 60 })}"?`,
            { modal: true }, ...options)
        if (select !== options[0]) {
            return null
        }

        await vscode.commands.executeCommand('git.undoCommit')
        await vscode.commands.executeCommand('workbench.view.scm')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitEmpty', async () => {
        const root = await getSingleFolder()
        if (!root) {
            return null
        }

        const options: Array<vscode.MessageItem> = [{ title: 'Create an Empty Commit' }, { title: 'Cancel', isCloseAffordance: true }]
        const select = await vscode.window.showWarningMessage(
            `Are you sure you want to create an empty commit?`,
            { modal: true }, ...options)
        if (select !== options[0]) {
            return null
        }

        try {
            await git(root.uri, 'commit', '--allow-empty', '--message="(empty commit)"')

        } catch (ex) {
            await showError(`Git Grace: Committing failed.`)
            return null
        }

        vscode.window.setStatusBarMessage(`Committing completed`, 5000)

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
        const repoList = await getRepositoryList()

        const httpList: Array<string> = []
        for (const repo of repoList) {
            if (repo.http.startsWith('https://github.com/') === false) {
                continue
            }

            const rootPath = repo.root.uri.fsPath
            let workPath = _.get(vscode.window.activeTextEditor, 'document.fileName', '') as string
            if (getGitFolder(workPath) === null) {
                workPath = null
            }


            const remoteBranches = await getRemoteBranchNames(repo.root.uri)
            if (remoteBranches.indexOf('origin/master') >= 0) {
                if (rootPath !== repo.path) {
                    httpList.push(repo.http + '/tree/master/' + getHttpPart(rootPath.substring(repo.path.length)))
                }

                if (workPath) {
                    httpList.push(repo.http + '/tree/master/' + getHttpPart(workPath.substring(repo.path.length)))
                }
            }

            const status = await getCurrentBranchStatus(repo.root.uri)
            if (status !== null && status.local !== 'master' && remoteBranches.indexOf(status.remote || ('origin/' + status.local)) >= 0) {
                httpList.push(repo.http + `/tree/${status.local}/` + getHttpPart(rootPath.substring(repo.path.length)))

                if (workPath) {
                    httpList.push(repo.http + `/tree/${status.local}/` + getHttpPart(workPath.substring(repo.path.length)))
                }
            }
        }

        if (httpList.length === 0) {
            return null
        }

        if (httpList.length === 1) {
            open(httpList[0])
            return null
        }

        const pickList = httpList.map(http => {
            const host = http.match(/^https?:\/\/[\w.]+\//)[0]
            return {
                label: _.trimEnd(http.substring(host.length), '/'),
                description: _.trimEnd(host, '/'),
            }
        })

        const pick = await vscode.window.showQuickPick(pickList)
        if (pick) {
            open(pick.description + '/' + pick.label)
            return null
        }
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pullRequest', async () => {
        let repoList = await getRepositoryList()

        if (repoList.length === 0) {
            return null
        }

        if (repoList.length > 1 && vscode.window.activeTextEditor) {
            const workRoot = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
            const workRepo = repoList.find(repo => repo.root.uri.toString() === workRoot.uri.toString())
            if (workRepo !== undefined) {
                repoList = [workRepo]
            }
        }

        if (repoList.length > 1) {
            const root = await vscode.window.showWorkspaceFolderPick()
            if (root === undefined) {
                return null
            }

            const workRepo = repoList.find(repo => repo.root.uri.toString() === root.uri.toString())
            if (workRepo === undefined) {
                return vscode.window.showErrorMessage(`Git Grace: The selected workspace was not a GitHub repository.`)
            }

            repoList = [workRepo]
        }

        const repo = repoList[0]

        const status = await getCurrentBranchStatus(repo.root.uri)
        if (status === null) {
            return vscode.window.showErrorMessage(`Git Grace: The current repository was not attached to any branches.`)
        }
        if (status.local === 'master') {
            return vscode.window.showErrorMessage(`Git Grace: The current branch was "master" branch.`)
        }
        if (status.distance < 0) {
            return vscode.window.showErrorMessage(`Git Grace: The current branch was behind its remote branch.`)
        }

        if (status.remote === '' || status.distance > 0) {
            const result = await vscode.commands.executeCommand('gitGrace.push')
            if (result !== undefined) {
                return null
            }
        }

        open(repo.http + '/compare/' + 'master' + '...' + (status.remote.replace(/^origin\//, '') || status.local))
    }))

    const tortoiseGit = new TortoiseGit(getWorkingFile, getSingleFolder, getGitFolder)
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
        vscode.window.showErrorMessage(`There were no files opened.`)
        return null
    }

    if (getGitFolder(vscode.window.activeTextEditor.document.uri) === null) {
        vscode.window.showErrorMessage(`The current file was not in Git repository.`)
        return null
    }

    return vscode.window.activeTextEditor.document.uri
}

async function getSingleFolder() {
    const rootList = getTotalFolders()
    if (rootList.length === 0) {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage(`There were no folders opened.`)
            return null

        } else {
            vscode.window.showErrorMessage(`The current folder was not in Git repository.`)
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
    return (vscode.workspace.workspaceFolders || []).filter(root => !!getGitFolder(root.uri))
}

function getGitFolder(link: vscode.Uri | string) {
    if (!link) {
        return null
    }

    const pathList = (typeof link === 'string' ? link : link.fsPath).split(/\\|\//)
    for (let rank = pathList.length; rank > 0; rank--) {
        const path = fp.join(...pathList.slice(0, rank), '.git')
        if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
            return fp.dirname(path)
        }
    }

    return null
}

function getHttpPart(path: string) {
    return _.trim(path.replace(/\\|\//g, '/'), '/')
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
