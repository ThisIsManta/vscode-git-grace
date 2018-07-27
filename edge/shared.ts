import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as os from 'os'
import * as _ from 'lodash'
import * as vscode from 'vscode'

let outputChannel: vscode.OutputChannel
let rootList: Array<vscode.WorkspaceFolder> = []

export function startUp() {
	outputChannel = vscode.window.createOutputChannel('Git Grace')

	if (vscode.workspace.workspaceFolders) {
		rootList = vscode.workspace.workspaceFolders.filter(root => !!getGitFolder(root.uri))
	}
}

export function cleanUp() {
	if (outputChannel) {
		outputChannel.hide()
		outputChannel.dispose()
		outputChannel = null
	}
}

export function getOutputChannel() {
	return outputChannel
}

// TODO: rename to "getWorkspaceListWithGitEnabled"
export function getRootList() {
	return rootList
}

export function setRootAsFailure(root: vscode.WorkspaceFolder) {
	rootList = _.sortBy(rootList, item => item === root ? 0 : 1)
}

export async function updateWorkspaceList(e: vscode.WorkspaceFoldersChangeEvent) {
	rootList.push(...e.added.filter(root => !!getGitFolder(root.uri)))
	_.pull(rootList, ...e.removed)
}

export async function getCurrentRoot() {
	// TODO: add "onErrorThrowError" parameter
	if (rootList.length === 0) {
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage(`There were no folders opened.`, { modal: true })
			return null

		} else {
			vscode.window.showErrorMessage(`The current folder was not in Git repository.`, { modal: true })
			return null
		}
	}

	if (vscode.workspace.workspaceFolders.length === 1 && rootList.length === 1) {
		return rootList[0]
	}

	if (vscode.window.activeTextEditor) {
		const currentRoot = rootList.find(root => root.uri.fsPath === vscode.window.activeTextEditor.document.uri.fsPath)
		if (currentRoot) {
			return currentRoot
		}
	}

	const select = await vscode.window.showQuickPick(rootList.map(item => item.name))
	if (!select) {
		return null
	}

	return rootList.find(item => select === item.name)
}

export enum SyncStatus {
	InSync,
	OutOfSync,
	Behind,
	Ahead,
}

interface BranchStatus {
	local: string
	remote: string
	dirty: boolean
	sync: SyncStatus
	distance: number
}

export function saveAllFilesOnlyIfAutoSaveIsOn() {
	const autoSave = vscode.workspace.getConfiguration('files').get<string>('autoSave')
	if (autoSave === 'afterDelay' || autoSave === 'onFocusChange') {
		return vscode.workspace.saveAll(false)
	}
}

const gitPath = vscode.workspace.getConfiguration('git').get<string>('path') || (os.platform() === 'win32' ? 'C:/Program Files/Git/bin/git.exe' : 'git')
export const git = (link: vscode.Uri, ...formalParameters: Array<string>): Promise<string> => new Promise((resolve, reject) => {
	const actualParameters = formalParameters.filter(parameter => !!parameter)

	outputChannel.appendLine('git ' + actualParameters.join(' '))

	const pipe = cp.spawn(gitPath, actualParameters, { cwd: link.fsPath.replace(/\\/g, fp.posix.sep) })

	let outputBuffer = ''

	pipe.stdout.on('data', text => {
		outputBuffer += String(text)
		outputChannel.append(String(text))
	})

	pipe.stderr.on('data', text => {
		outputBuffer += String(text)
		outputChannel.append(String(text))
	})

	pipe.on('close', exit => {
		outputChannel.appendLine('')

		if (exit === 0) {
			resolve(outputBuffer)
		} else {
			reject(outputBuffer)
		}
	})
})

export async function getCurrentBranchStatus(link: vscode.Uri): Promise<BranchStatus> {
	const status = await git(link, 'status', '--short', '--branch')

	const chunk = status.split('\n')[0].substring(3).trim()
	const dirty = status.trim().split('\n').length > 1

	if (chunk.includes('(no branch)')) {
		return { local: '', remote: '', dirty, sync: SyncStatus.InSync, distance: 0 }
	}

	let local = chunk
	let remote = ''
	if (chunk.includes('...')) {
		const separator = chunk.indexOf('...')
		local = chunk.substring(0, separator)
		if (chunk.endsWith('[gone]') == false) {
			remote = chunk.substring(separator + 3).trim()
			if (remote.indexOf(' [') > 0) {
				remote = remote.substring(0, remote.indexOf(' ['))
			}
		}

	} else {
		const remoteBranches = await getRemoteBranchNames(link)
		const counterpartBranch = remoteBranches.find(branch => branch === `origin/${local}`) || ''
		if (counterpartBranch) {
			await setRemoteBranch(link, local)
			const newStatus = await getCurrentBranchStatus(link)
			remote = newStatus.remote
		}
	}

	let sync = SyncStatus.InSync
	let distance = 0
	if (local && remote) {
		const result = await git(link, 'rev-list', '--left-right', local + '...' + remote)
		const trails = _.countBy(result.trim().split('\n'), line => line.charAt(0))
		if (trails['<'] && trails['>']) {
			sync = SyncStatus.OutOfSync
		} else if (trails['<']) {
			sync = SyncStatus.Ahead
		} else if (trails['>']) {
			sync = SyncStatus.Behind
		}
		distance = (trails['<'] || 0) + (trails['>'] || 0)
	}

	return { local, remote, dirty, sync, distance }
}

export async function getLocalBranchNames(link: vscode.Uri) {
	const content = await git(link, 'branch', '--list')
	return _.chain(content.split('\n'))
		.map(line => line.startsWith('*') ? line.substring(1) : line)
		.map(_.trim)
		.compact()
		.value()
}

export async function getRemoteBranchNames(link: vscode.Uri) {
	const content = await git(link, 'branch', '--list', '--remotes')
	return _.chain(content.split('\n'))
		.map(line => line.trim())
		.map(line => line.split(' -> '))
		.flatten()
		.compact()
		.value()
}

export function setRemoteBranch(link: vscode.Uri, branch: string) {
	return git(link, 'branch', `--set-upstream-to=origin/${branch}`, branch)
}

export async function getLastCommit(link: vscode.Uri) {
	const result = await git(link, 'log', '--max-count', '1', '--oneline')
	return {
		sha1: result.substring(0, result.indexOf(' ')).trim(),
		message: result.substring(result.indexOf(' ') + 1).trim().split('\n')[0],
	}
}

const gitPattern = /^\turl\s*=\s*git@(.+)\.git/
const urlPattern = /^\turl\s*=\s*(.+)\.git$/

export async function getRepositoryList() {
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

export function getWorkingFile() {
	if (!vscode.window.activeTextEditor) {
		vscode.window.showErrorMessage(`There were no files opened.`, { modal: true })
		return null
	}

	if (getGitFolder(vscode.window.activeTextEditor.document.uri) === null) {
		vscode.window.showErrorMessage(`The current file was not in Git repository.`, { modal: true })
		return null
	}

	return vscode.window.activeTextEditor.document.uri
}

export function getGitFolder(link: vscode.Uri | string) {
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

export function getHttpPart(path: string) {
	return _.trim(path.replace(/\\|\//g, '/'), '/')
}

export async function retry<T>(count: number, action: () => Promise<T>): Promise<T> {
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

export async function sleep(time: number) {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve()
		}, time)
	})
}
