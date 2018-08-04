import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as os from 'os'
import * as _ from 'lodash'
import * as vscode from 'vscode'

import Log from './Log'

namespace BuiltInGitExtension {
	export interface Repository {
		readonly rootUri: vscode.Uri
		readonly inputBox: vscode.SourceControlInputBox
	}

	export interface API {
		getRepositories(): Promise<Repository[]>
		getGitPath(): Promise<string>
	}
}

export function getBuiltInGitExtension() {
	return vscode.extensions.getExtension<BuiltInGitExtension.API>('vscode.git')
}

let gitExecutablePath = ''

export const run = (link: vscode.Uri, ...formalParameters: Array<string>): Promise<string> => new Promise<string>(async (resolve, reject) => {
	const actualParameters = formalParameters.filter(parameter => !!parameter)

	Log.appendLine('git ' + actualParameters.join(' '))

	if (gitExecutablePath === '') {
		gitExecutablePath = await getBuiltInGitExtension().exports.getGitPath()
	}

	const pipe = cp.spawn(gitExecutablePath, actualParameters, { cwd: link.fsPath.replace(/\\/g, fp.posix.sep) })

	let outputBuffer = ''

	pipe.stdout.on('data', text => {
		outputBuffer += String(text)
		Log.append(String(text))
	})

	pipe.stderr.on('data', text => {
		outputBuffer += String(text)
		Log.append(String(text))
	})

	pipe.on('close', exit => {
		Log.appendLine('')

		if (exit === 0) {
			resolve(outputBuffer)
		} else {
			reject(outputBuffer)
		}
	})
})

export function getRepositoryPath(link: vscode.Uri | string) {
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

export async function getLocalBranchNames(link: vscode.Uri) {
	const content = await run(link, 'branch', '--list')
	return _.chain(content.split('\n'))
		.map(line => line.startsWith('*') ? line.substring(1) : line)
		.map(_.trim)
		.compact()
		.value()
}

export async function getRemoteBranchNames(link: vscode.Uri) {
	const content = await run(link, 'branch', '--list', '--remotes')
	return _.chain(content.split('\n'))
		.map(line => line.trim())
		.map(line => line.split(' -> '))
		.flatten()
		.compact()
		.value()
}

export function setRemoteBranch(link: vscode.Uri, localBranchName: string) {
	return run(link, 'branch', `--set-upstream-to=origin/${localBranchName}`, localBranchName)
}

export async function getLastCommit(link: vscode.Uri) {
	const result = await run(link, 'log', '--max-count', '1', '--oneline')
	return {
		sha1: result.substring(0, result.indexOf(' ')).trim(),
		message: result.substring(result.indexOf(' ') + 1).trim().split('\n')[0],
	}
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

export async function getCurrentBranchStatus(link: vscode.Uri): Promise<BranchStatus> {
	const status = await run(link, 'status', '--short', '--branch')

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
		const result = await run(link, 'rev-list', '--count', '--left-right', local + '...' + remote)
		const [left, right] = result.match(/(\d+)\s+(\d+)/).slice(1).map(numb => parseInt(numb))
		if (left > 0 && right > 0) {
			sync = SyncStatus.OutOfSync
		} else if (left > 0) {
			sync = SyncStatus.Ahead
		} else if (right > 0) {
			sync = SyncStatus.Behind
		}
		distance = left + right
	}

	return { local, remote, dirty, sync, distance }
}

const gitPattern = /^\turl\s*=\s*git@(.+)\.git/
const urlPattern = /^\turl\s*=\s*(.+)\.git$/

export function getHttpPath(workspace: vscode.WorkspaceFolder) {
	const repositoryPath = getRepositoryPath(workspace.uri)
	const confPath = fp.join(repositoryPath, '.git', 'config')
	if (!fs.existsSync(confPath)) {
		return null
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

	return dict.get('[remote "origin"]') || null
}
