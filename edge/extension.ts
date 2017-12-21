import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as os from 'os'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as process from 'process'
import * as open from 'open'

import TortoiseGit from './TortoiseGit'

let outputChannel: vscode.OutputChannel
let syncingStatusBar: vscode.StatusBarItem

const processingActionList: Array<() => Promise<any>> = []
function queue(action: () => Promise<any>) {
    return async (bypass: boolean) => {
        if (bypass) {
            return await action()
        }

        processingActionList.unshift(action)

        if (processingActionList.length === 1) {
            await action()
            processingActionList.pop()

            while (processingActionList.length > 0) {
                const nextAction = _.last(processingActionList)
                await nextAction()
                processingActionList.pop()
            }
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Git Grace')

    function checkIfAutoSaveIsOn() {
        const autoSave = vscode.workspace.getConfiguration('files').get<string>('autoSave')
        return autoSave === 'afterDelay' || autoSave === 'onFocusChange'
    }

    const gitPath = vscode.workspace.getConfiguration('git').get<string>('path') || (os.platform() === 'win32' ? 'C:/Program Files/Git/bin/git.exe' : 'git')
    const git = (link: vscode.Uri, ...parameters: Array<string>): Promise<string> => new Promise((resolve, reject) => {
        outputChannel.appendLine('git ' + parameters.join(' '))

        const pipe = cp.spawn(gitPath, parameters, { cwd: link.fsPath.replace(/\\/g, fp.posix.sep) })

        let errorBuffer = ''
        pipe.stderr.on('data', text => {
            errorBuffer += String(text)
            outputChannel.append(String(text))
        })

        let outputBuffer = ''
        pipe.stdout.on('data', text => {
            outputBuffer += String(text)
            outputChannel.append(String(text))
        })

        pipe.on('close', exit => {
            outputChannel.appendLine('')

            if (exit === 0) {
                resolve(outputBuffer)
            } else {
                reject(errorBuffer)
            }
        })
    })

    async function getCurrentBranchStatus(link: vscode.Uri) {
        const status = await git(link, 'status', '--short', '--branch')

        const chunk = status.split('\n')[0].substring(3).trim()
        const dirty = status.trim().split('\n').length > 1

        if (chunk.includes('(no branch)')) {
            return { local: '', remote: '', distance: 0, dirty }
        }

        let local = chunk
        let remote = ''
        let distance = 0
        if (chunk.includes('...')) {
            const separator = chunk.indexOf('...')
            local = chunk.substring(0, separator)
            remote = chunk.substring(separator + 3).trim()

            if (/\[(ahead|behind)\s\d+\]/.test(remote)) {
                distance = parseInt(chunk.match(/\[(ahead|behind)\s(\d+)\]/)[2])
                if (/\[behind\s\d+\]/.test(remote)) {
                    distance *= -1
                }

            } else if (/\[ahead\s\d+, behind\s\d+\]/.test(remote)) {
                distance = NaN
            }

            if (remote.indexOf(' [') > 0) {
                remote = remote.substring(0, remote.indexOf(' ['))
            }

        } else {
            const remoteBranches = await getRemoteBranchNames(link)
            const counterpartBranch = remoteBranches.find(branch => branch === `origin/${local}`) || ''
            if (counterpartBranch) {
                await setRemoteBranch(link, local)
                const newStatus = await getCurrentBranchStatus(link)
                remote = newStatus.remote
                distance = newStatus.distance
            }
        }

        return { local, remote, distance, dirty }
    }

    async function getLocalBranchNames(link: vscode.Uri) {
        const content = await git(link, 'branch', '--list')
        return _.chain(content.split('\n'))
            .map(line => line.startsWith('*') ? line.substring(1) : line)
            .map(_.trim)
            .compact()
            .value()
    }

    async function getRemoteBranchNames(link: vscode.Uri) {
        const content = await git(link, 'branch', '--list', '--remotes')
        return _.chain(content.split('\n'))
            .map(line => line.trim())
            .map(line => line.split(' -> '))
            .flatten()
            .compact()
            .value()
    }

    function setRemoteBranch(link: vscode.Uri, branch: string) {
        return git(link, 'branch', `--set-upstream-to=origin/${branch}`, branch)
    }

    async function getLastCommit(link: vscode.Uri) {
        const result = await git(link, 'log', '--max-count', '1', '--oneline')
        return {
            sha1: result.substring(0, result.indexOf(' ')).trim(),
            message: result.substring(result.indexOf(' ') + 1).trim().split('\n')[0],
        }
    }

    let rootList: Array<vscode.WorkspaceFolder> = []
    if (vscode.workspace.workspaceFolders) {
        rootList = vscode.workspace.workspaceFolders.filter(root => !!getGitFolder(root.uri))
    }

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
        rootList.push(...e.added.filter(root => !!getGitFolder(root.uri)))
        _.pull(rootList, ...e.removed)
    }))

    function setRootAsFailure(root: vscode.WorkspaceFolder) {
        rootList = _.sortBy(rootList, item => item === root ? 0 : 1)
    }

    const gitPattern = /^\turl\s*=\s*git@(.+)\.git/
    const urlPattern = /^\turl\s*=\s*(.+)\.git$/

    async function getRepositoryList() {
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

    async function getCurrentRoot() {
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

    function getGitFolder(link: vscode.Uri | string) {
        if (!link) {
            return null
        }

        const pathList = (typeof link === 'string' ? link : link.fsPath).split(/\\|\//)
        for (let rank = pathList.length; rank > 0; rank--) {
            const path = [...pathList.slice(0, rank), '.git'].join(fp.sep)
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
            outputChannel.show()
        }
    }

    let lastFetchStamp: number = undefined
    function checkIfRecentlyFetched() {
        return lastFetchStamp !== undefined && Date.now() - lastFetchStamp < 15000
    }

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.fetch', queue(async () => {
        if (rootList.length === 0) {
            return null
        }

        const error = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Fetching...' }, async (progress) => {
            let repoGotUpdated = false

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
                    setRootAsFailure(root)

                    if (rootList.length > 1) {
                        showError(`Git Grace: Fetching "${root.name}" failed.`)
                    } else {
                        showError(`Git Grace: Fetching failed.`)
                    }
                    return null
                }
            }

            if (repoGotUpdated) {
                vscode.commands.executeCommand('git.refresh')

            } else {
                vscode.window.showInformationMessage(`Git Grace: There were no updates.`)
            }

            vscode.window.setStatusBarMessage(`Fetching completed`, 5000)
        })
        if (error !== undefined) {
            return null
        }

        lastFetchStamp = Date.now()

        let root: vscode.WorkspaceFolder
        if (
            vscode.window.activeTextEditor &&
            vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri) &&
            (root = rootList.find(root => root.uri.fsPath === vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri).uri.fsPath))
        ) {
            const status = await getCurrentBranchStatus(root.uri)
            if (status.local !== '' && status.remote !== '' && status.distance < 0) {
                const options: Array<vscode.MessageItem> = [{ title: 'Fast Forward' }, { title: 'Do Nothing', isCloseAffordance: true }]
                const select = await vscode.window.showInformationMessage(
                    `The branch "${status.local}" is behind its remote branch.`,
                    ...options)
                if (select === options[0]) {
                    try {
                        await git(root.uri, 'rebase', '--autostash', status.remote)

                    } catch (ex) {
                        setRootAsFailure(root)

                        showError(`Git Grace: Fast forwarding failed.`)
                        return null
                    }
                }
            }
        }
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pull', queue(async () => {
        if (rootList.length === 0) {
            return null
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pulling...' }, async (progress) => {
            for (const root of rootList) {
                try {
                    await retry(2, () => git(root.uri, 'fetch', '--prune', 'origin'))

                    const status = await getCurrentBranchStatus(root.uri)
                    if (status.local === '' || status.remote === '') {
                        continue
                    }

                    await git(root.uri, 'rebase')

                } catch (ex) {
                    setRootAsFailure(root)

                    showError(`Git Grace: Pulling failed.`)
                    return null
                }
            }

            vscode.window.setStatusBarMessage(`Pulling completed`, 5000)

            vscode.commands.executeCommand('git.refresh')
        })
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.push', queue(async () => {
        if (rootList.length === 0) {
            return null
        }

        if (checkIfAutoSaveIsOn()) {
            await vscode.commands.executeCommand('workbench.action.files.saveAll')
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pushing...' }, async (progress) => {
            let repoGotUpdated = false

            for (const root of rootList) {
                if (rootList.length > 1) {
                    progress.report({ message: `Pushing "${root.name}"...` })
                }

                const status = await getCurrentBranchStatus(root.uri)
                if (status.local === '') {
                    return vscode.window.showErrorMessage(`Git Grace: You were not on any branches.`)
                }

                const branch = status.local
                try {
                    const result = await git(root.uri, 'push', '--tags', 'origin', branch)
                    if (result.trim() !== 'Everything up-to-date') {
                        repoGotUpdated = true
                    }

                } catch (ex) {
                    if (String(ex).includes('hint: Updates were rejected because the tip of your current branch is behind')) {
                        const options: Array<vscode.MessageItem> = [{ title: 'Force Pushing' }, { title: 'Cancel', isCloseAffordance: true }]
                        const select = await vscode.window.showWarningMessage(
                            `The current branch on repository "${root.name}" could not be pushed because its remote branch was out-of-sync.`,
                            { modal: true }, ...options)
                        if (select !== options[0]) {
                            return null
                        }

                        await git(root.uri, 'push', '--force-with-lease', 'origin', branch)
                        repoGotUpdated = true

                    } else {
                        setRootAsFailure(root)

                        if (rootList.length > 1) {
                            showError(`Git Grace: Pushing "${root.name}" failed.`)
                        } else {
                            showError(`Git Grace: Pushing failed.`)
                        }
                        return null
                    }
                }
            }

            if (repoGotUpdated) {
                vscode.commands.executeCommand('git.refresh')

            } else {
                vscode.window.showInformationMessage(`Git Grace: There were no updates.`)
            }

            vscode.window.setStatusBarMessage(`Pushing completed`, 5000)
        })
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitAmend', async () => {
        const root = await getCurrentRoot()
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
        const root = await getCurrentRoot()
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
            await git(root.uri, 'commit', '--allow-empty', '--message=(empty commit)')

        } catch (ex) {
            setRootAsFailure(root)

            showError(`Git Grace: Committing failed.`)
            return null
        }

        vscode.window.setStatusBarMessage(`Committing completed`, 5000)

        vscode.commands.executeCommand('git.refresh')
    }))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.stash', queue(async () => {
        const root = await getCurrentRoot()
        if (!root) {
            return null
        }

        if (checkIfAutoSaveIsOn()) {
            await vscode.commands.executeCommand('workbench.action.files.saveAll')
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Stashing...' }, async () => {
            try {
                await git(root.uri, 'stash', 'save', '--include-untracked')

            } catch (ex) {
                setRootAsFailure(root)

                showError(`Git Grace: Stashing failed.`)
                return null
            }
        })

        vscode.commands.executeCommand('git.refresh')
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.master', queue(async () => {
        const root = await getCurrentRoot()
        if (!root) {
            return null
        }

        if (checkIfAutoSaveIsOn()) {
            await vscode.commands.executeCommand('workbench.action.files.saveAll')
        }

        const status = await getCurrentBranchStatus(root.uri)
        if (status.dirty) {
            const options: Array<vscode.MessageItem> = [{ title: 'Stash Now' }, { title: 'Discard All Files' }, { title: 'Cancel', isCloseAffordance: true }]
            const select = await vscode.window.showWarningMessage(
                `The current repository was dirty.`,
                { modal: true }, ...options)
            if (select === options[0]) {
                const error = await vscode.commands.executeCommand('gitGrace.stash', true)
                if (error !== undefined) {
                    return null
                }

            } else if (select === options[1]) {
                try {
                    await git(root.uri, 'reset', '--hard')

                } catch (ex) {
                    showError(`Git Grace: Cleaning up files failed.`)
                    return null
                }

            } else {
                return null
            }
        }

        if (checkIfRecentlyFetched() === false) {
            await vscode.commands.executeCommand('gitGrace.fetch', true)
        }

        const masterInfo = await git(root.uri, 'rev-parse', 'origin/master')
        const masterHash = masterInfo.trim()
        const commitInfo = await git(root.uri, 'status', '--branch', '--porcelain=2')
        const commitHash = commitInfo.split('\n').find(line => line.startsWith('# branch.oid ')).substring('# branch.oid '.length).trim()
        if (masterHash === commitInfo) {
            vscode.window.showInformationMessage(`Git Grace: You are on "origin/master" already.`)
            return null
        }

        try {
            await git(root.uri, 'checkout', '--detach', 'origin/master')

        } catch (ex) {
            showError(`Git Grace: Checking out "origin/master" failed.`)
            return null
        }

        vscode.commands.executeCommand('git.refresh')
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.openWeb', queue(async () => {
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
            if (status.local !== '' && status.local !== 'master' && status.remote !== '') {
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
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pullRequest', queue(async () => {
        const root = await getCurrentRoot()
        if (!root) {
            return null
        }

        let repoList = await getRepositoryList()
        if (repoList.length === 0) {
            return null
        }

        const repo = repoList.find(repo => repo.root.uri.fsPath === root.uri.fsPath)
        if (repo === undefined) {
            return vscode.window.showErrorMessage(`Git Grace: The selected workspace was not a GitHub repository.`)
        }

        const status = await getCurrentBranchStatus(root.uri)
        if (status.local === '') {
            return vscode.window.showErrorMessage(`Git Grace: The current repository was not attached to any branches.`)
        }
        if (status.local === 'master') {
            return vscode.window.showErrorMessage(`Git Grace: The current branch was "master" branch.`)
        }
        if (status.distance < 0) {
            return vscode.window.showErrorMessage(`Git Grace: The current branch was behind its remote branch.`)
        }
        if (isNaN(status.distance)) {
            return vscode.window.showErrorMessage(`Git Grace: The current branch was out-of-sync with its remote branch.`)
        }
        if (status.remote === '' || status.distance > 0) {
            const error = await vscode.commands.executeCommand('gitGrace.push', true)
            if (error !== undefined) {
                return null
            }
        }

        open(repo.http + '/compare/' + 'master' + '...' + (status.remote.replace(/^origin\//, '') || status.local))
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.sync', queue(async () => {
        const root = await getCurrentRoot()
        if (!root) {
            return null
        }

        if (checkIfAutoSaveIsOn()) {
            await vscode.commands.executeCommand('workbench.action.files.saveAll')
        }

        await vscode.commands.executeCommand('git.refresh')

        const status = await getCurrentBranchStatus(root.uri)
        if (status.dirty) {
            await vscode.commands.executeCommand('git.commit')

            const statusAfterCommitCommand = await getCurrentBranchStatus(root.uri)
            if (statusAfterCommitCommand.dirty) {
                return null
            }
        }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Syncing...' }, async () => {
            try {
                if (status.remote === '') {
                    await git(root.uri, 'push', 'origin', status.local)
                    await setRemoteBranch(root.uri, status.local)
                }

                await git(root.uri, 'pull', '--all', '--rebase')
                await git(root.uri, 'push', '--all')
                await git(root.uri, 'push', '--tags')

            } catch (ex) {
                setRootAsFailure(root)

                showError(`Git Grace: Syncing failed.`)
                return null
            }

            vscode.window.setStatusBarMessage(`Syncing completed`, 5000)

            vscode.commands.executeCommand('git.refresh')
        })
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.deleteMergedBranches', queue(async () => {
        if (rootList.length === 0) {
            return null
        }

        if (syncingStatusBar !== undefined) {
            return undefined
        }

        syncingStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10)
        syncingStatusBar.text = `$(zap) Querying merged branches...`
        syncingStatusBar.tooltip = 'Click to cancel the operation'
        syncingStatusBar.command = 'gitGrace.deleteMergedBranches.cancel'
        syncingStatusBar.show()

        let mergedBranches: Array<{ root: vscode.WorkspaceFolder, name: string }> = []
        for (const root of rootList) {
            const branches = _.chain([
                await git(root.uri, 'branch', '--merged', 'origin/master'),
                await git(root.uri, 'branch', '--merged', 'origin/master', '--remotes'),
            ])
                .map(content => content.trim().split('\n'))
                .flatten()
                .map(branch => branch.trim())
                .map(branch => branch.split(' -> '))
                .flatten()
                .difference(['origin/HEAD', 'origin/master'])
                .reject(branch => branch.startsWith('*'))
                .compact()
                .map(branch => ({ root, name: branch }))
                .value()
            mergedBranches = mergedBranches.concat(branches)
        }

        if (mergedBranches.length === 0) {
            vscode.commands.executeCommand('gitGrace.deleteMergedBranches.cancel')
            return undefined
        }

        const options: Array<vscode.MessageItem> = [{ title: 'Delete Merged Branches' }, { title: 'Cancel', isCloseAffordance: true }]
        const select = await vscode.window.showInformationMessage(
            `Git Grace: Are you sure you want to delete ${mergedBranches.length} merged branches?`,
            ...options)
        if (select !== options[0]) {
            vscode.commands.executeCommand('gitGrace.deleteMergedBranches.cancel')
            return undefined
        }

        let count = 1
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, async () => {
                const [remotes, locals] = _.partition(mergedBranches, branch => branch.name.startsWith('origin/'))
                for (const branch of locals) {
                    syncingStatusBar.text = `$(zap) Deleting merged branches... (${count} of ${mergedBranches.length})`
                    await retry(1, () => git(branch.root.uri, 'branch', '--delete', branch.name))
                    count += 1
                }
                for (const branch of remotes) {
                    syncingStatusBar.text = `$(zap) Deleting merged branches... (${count} of ${mergedBranches.length})`
                    const branchNameWithoutOrigin = branch.name.substring(branch.name.indexOf('/') + 1)
                    try {
                        await retry(1, () => git(branch.root.uri, 'push', '--delete', 'origin', branchNameWithoutOrigin))
                    } catch (ex) {
                        setRootAsFailure(branch.root)

                        if (typeof ex !== 'string' || ex.includes(`error: unable to delete '${branchNameWithoutOrigin}': remote ref does not exist`) === false) {
                            throw ex
                        }
                    }
                    count += 1
                }
            })
            count -= 1 // Compensate the initial count of 1

            vscode.window.showInformationMessage(`Git Grace: ${mergedBranches.length} merged branches have been deleted.`)

        } catch (ex) {
            if (ex instanceof Error) {
                outputChannel.appendLine(ex.message)
            }

            showError(`Git Grace: Deleting merged branches failed - only ${count === 1 ? `branch "${mergedBranches[0]}" has` : `${count} branches have`} been deleted.`)
        }

        vscode.commands.executeCommand('gitGrace.deleteMergedBranches.cancel')
    })))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.deleteMergedBranches.cancel', () => {
        if (syncingStatusBar) {
            syncingStatusBar.hide()
            syncingStatusBar.dispose()
            syncingStatusBar = undefined
        }
    }))

    const tortoiseGit = new TortoiseGit(getWorkingFile, getCurrentRoot, getGitFolder)
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.showLog', queue(() => tortoiseGit.showLog())))
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.showFileLog', queue(() => tortoiseGit.showFileLog())))
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.commit', queue(() => tortoiseGit.commit())))
    context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.blame', () => tortoiseGit.blame()))
}

export function deactivate() {
    if (outputChannel) {
        outputChannel.dispose()
    }

    if (syncingStatusBar) {
        syncingStatusBar.dispose()
    }

    processingActionList.splice(0, processingActionList.length)
}
