import * as cp from 'child_process'
import * as fs from 'fs'
import chunk from 'lodash/chunk'
import compact from 'lodash/compact'
import escapeRegExp from 'lodash/escapeRegExp'
import trim from 'lodash/trim'
import * as fp from 'path'
import { setTimeout as delay } from 'timers/promises'
import * as vscode from 'vscode'

import * as GitBuiltInExtension from './GitBuiltInExtension.d'
import Log from './Log'

export function getGitBuiltInExtension() {
	return vscode.extensions.getExtension<GitBuiltInExtension.GitExtension>('vscode.git')!
}

let gitExecutablePath = ''

interface Options {
	retry?: number
	token?: vscode.CancellationToken
}

export async function run(link: vscode.Uri, ...formalParameters: Array<string | Options>): Promise<string> {
	const parameters = formalParameters.filter((parameter): parameter is string => typeof parameter === 'string' && parameter.trim().length > 0)
	const options = formalParameters.find((parameter): parameter is Options => typeof parameter === 'object' && parameter !== null)

	let count = options?.retry || 0
	while (true) {
		if (options?.token?.isCancellationRequested) {
			return ''
		}

		try {
			return await runInternal(link, parameters, options?.token)

		} catch (error) {
			if (count > 0) {
				count -= 1
				await delay(500)

				continue
			}

			throw error
		}
	}
}

const runInternal = (link: vscode.Uri, formalParameters: Array<string>, token?: vscode.CancellationToken) => new Promise<string>((resolve, reject) => {
	const actualParameters = ['--no-pager', ...formalParameters]

	Log.appendLine('git ' + actualParameters.join(' '))

	if (gitExecutablePath === '') {
		gitExecutablePath = getGitBuiltInExtension().exports.getAPI(1).git.path
	}

	const pipe = cp.spawn(gitExecutablePath, actualParameters, { cwd: getRepositoryLink(link)?.fsPath.replace(/\\/g, fp.posix.sep) })
	if (token) {
		token.onCancellationRequested(() => {
			pipe.kill()
		})
	}

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

		if (exit === 0 || exit === null) {
			resolve(outputBuffer)

		} else {
			reject(new GitCommandLineError(outputBuffer))
		}
	})
})

export class GitCommandLineError extends Error {
	constructor(public readonly output: string) {
		super(output)
	}
}

const repositoryCache = new Map<string, vscode.Uri>()
export function getRepositoryLink(link: vscode.Uri): vscode.Uri | null {
	if (!link) {
		return null
	}

	const directoryPath = fp.dirname(link.fsPath)
	const cachedLink = repositoryCache.get(directoryPath)
	if (cachedLink) {
		return cachedLink
	}

	const pathList = (typeof link === 'string' ? link : link.fsPath).split(/\\|\//)
	for (let rank = pathList.length; rank > 0; rank--) {
		const path = [...pathList.slice(0, rank), '.git'].join(fp.sep)
		if (fs.existsSync(path) && fs.statSync(path).isDirectory()) {
			const repositoryLink = vscode.Uri.file(fp.dirname(path))
			repositoryCache.set(directoryPath, repositoryLink)

			return repositoryLink
		}
	}

	return null
}

export async function getCurrentCommitHash(link: vscode.Uri, branchName: string = 'HEAD') {
	return (await run(link, 'rev-parse', branchName)).trim()
}

export async function getPushedCommitHash(link: vscode.Uri) {
	return (await run(link, 'log', '--format=%H', '--remotes=origin', '--max-count=1')).trim()
}

export async function getLocalBranches(link: vscode.Uri) {
	const result = await run(link, 'branch', '--list', '--format=%(objectname) %(refname:short) %(upstream:short) %(authordate:iso-strict)')
	return compact(result.split('\n'))
		.map(line => {
			const [commitHash, name, upstreamName, date] = line.trim().split(' ')
			return {
				commitHash,
				name,
				upstreamName: upstreamName || undefined,
				date: new Date(date),
			}
		})
}

export async function getRemoteBranches(link: vscode.Uri) {
	const result = await run(link, 'branch', '--list', '--remotes', '--format=%(objectname) %(refname:short) %(authordate:iso-strict)')
	return compact(result.split('\n'))
		// Remove "origin"
		.slice(1)
		.map(line => {
			const [commitHash, name, date] = line.trim().split(' ')
			return {
				commitHash,
				name,
				date: new Date(date),
			}
		})
}

export function setRemoteBranch(link: vscode.Uri, localBranchName: string) {
	return run(link, 'branch', `--set-upstream-to=origin/${localBranchName}`, localBranchName)
}

export async function getRemoteHeadBranchName(link: vscode.Uri) {
	const branchName = await run(link, 'symbolic-ref', 'refs/remotes/origin/HEAD')
	return branchName.trim().replace(new RegExp('^' + escapeRegExp('refs/remotes/origin/')), '')
}

export async function getBranchCounterparts(link: vscode.Uri) {
	const result = await run(link, 'for-each-ref', '--format=%(refname)|%(upstream)', 'refs/heads/')
	return compact(result.split('\n'))
		.map(line => line.split('|'))
		.map(([local, remote]) => ({
			local: local.replace(/^refs\/heads\//, ''),
			remote: remote.replace(/^refs\/remotes\//, '') || null,
		}))
}

export async function getLastCommit(link: vscode.Uri) {
	const result = await run(link, 'log', '--max-count', '1', '--format=format:%H%n%aI%n%s')
	const chunks = result.trim().split('\n')
	return {
		sha1: chunks[0],
		date: new Date(chunks[1]),
		message: chunks[2],
	}
}

export enum SyncStatus {
	LocalIsInSyncWithRemote,
	LocalIsNotInSyncWithRemote,
	LocalIsBehindRemote,
	LocalIsAheadOfRemote,
}

interface BranchStatus {
	local: string
	remote: string
	dirty: boolean
	sync: SyncStatus
	distance?: number
}

export async function getCurrentBranchStatus(link: vscode.Uri): Promise<BranchStatus> {
	const status = await run(link, 'status', '--short', '--branch')

	const chunk = status.split('\n')[0].substring(3).trim()
	const dirty = status.trim().split('\n').length > 1
	if (chunk.includes('(no branch)')) {
		return {
			local: '',
			remote: '',
			dirty,
			sync: SyncStatus.LocalIsInSyncWithRemote,
			distance: 0,
		}
	}

	let local = chunk
	let remote = ''
	if (chunk.includes('...')) {
		const separator = chunk.indexOf('...')
		local = chunk.substring(0, separator)

		if (chunk.endsWith('[gone]') === false) {
			remote = chunk.substring(separator + 3).trim()

			if (remote.indexOf(' [') > 0) {
				remote = remote.substring(0, remote.indexOf(' ['))
			}
		}

	} else {
		const remoteBranches = await getRemoteBranches(link)
		const counterpartBranch = remoteBranches.find(branch => branch.name === `origin/${local}`) || ''
		if (counterpartBranch) {
			await setRemoteBranch(link, local)

			const newStatus = await getCurrentBranchStatus(link)
			remote = newStatus.remote
		}
	}

	let sync = SyncStatus.LocalIsInSyncWithRemote
	let distance = 0
	if (local && remote) {
		const result = await run(link, 'rev-list', '--left-right', '--count', local + '...' + remote)
		const [left, right] = result.match(/(\d+)\s+(\d+)/)!.slice(1)
			.map(numb => parseInt(numb))

		if (left > 0 && right > 0) {
			sync = SyncStatus.LocalIsNotInSyncWithRemote

		} else if (left > 0) {
			sync = SyncStatus.LocalIsAheadOfRemote

		} else if (right > 0) {
			sync = SyncStatus.LocalIsBehindRemote
		}

		distance = left + right
	}

	return {
		local,
		remote,
		dirty,
		sync,
		distance,
	}
}

export async function getFileStatus(link: vscode.Uri) {
	const repositoryLink = getRepositoryLink(link)
	if (!repositoryLink) {
		return undefined
	}

	const status = await run(link, 'status', '--short')
	return status.split('\n')
		.filter(line => line.trim().length > 0)
		.map(line => ({
			symbol: line.substring(0, 2).trim(),
			currentLink: vscode.Uri.file(fp.join(
				repositoryLink.fsPath,
				line.substring(3).split('->').at(-1)!.trim(),
			)),
			originalLink: vscode.Uri.file(fp.join(
				repositoryLink.fsPath,
				line.substring(3).split('->').at(0)!.trim(),
			)),
		}))
		.find(file => file.currentLink.fsPath === link.fsPath)
}

export async function getBranchTopology(link: vscode.Uri, localBranchName: string, remoteBranchName: string): Promise<Array<Array<{
	email: string
	date: string
	message: string
	parentHash: string
	direction: string
	commitHash: string
}>>> {
	const result = await run(link, 'rev-list', '--topo-order', '--left-right', localBranchName + '...' + remoteBranchName, '--format=format:%P%n%aE%n%aI%n%f')
	if (result.trim() === '') {
		return []
	}

	const commits = chunk(result.trim().split('\n'), 5).map(([commit, parentHash, email, date, message]) => {
		// First line is always be "commit >X" where X is a 40-character-long commit hash
		const [match, direction, commitHash] = commit.match(/(<|>)(\w{40})/)!
		return {
			email,
			date,
			message,
			parentHash,
			direction,
			commitHash,
		}
	})
	const groups = [[commits[0]]]
	let index = 0
	while (++index < commits.length) {
		if (commits[index].direction === groups.at(-1)?.at(0)?.direction) {
			groups.at(-1)!.push(commits[index])

		} else {
			groups.push([commits[index]])
		}
	}

	return groups
}

export async function getWebOrigin(workspace: vscode.WorkspaceFolder): Promise<string> {
	// Do not use `git config get` to maintain compatibility with Apple Git (as part of Xcode Command Line Tools)
	const raw = (await run(workspace.uri, 'config', 'remote.origin.url')).trim().replace(/\.git$/, '')
	if (raw.startsWith('git@')) {
		return 'https://' + raw.replace(/^git@/, '').replace(':', '/')
	}

	return raw
}

export async function getFileBeforeRenamed(link: vscode.Uri): Promise<vscode.Uri | null> {
	const repositoryLink = getRepositoryLink(link)
	if (!repositoryLink) {
		return null
	}

	const relativeCurrentFilePath = trim(link.fsPath.substring(repositoryLink.fsPath.length), fp.sep)

	let status = await getFileStatus(link)
	if (status === undefined) {
		return null
	}

	if (status.symbol === '??') {
		await run(link, 'add', relativeCurrentFilePath.replace(/\\/g, '/'))
		status = await getFileStatus(link)
	}

	if (status && status.symbol === 'R' && status.currentLink.fsPath === link.fsPath) {
		return status.originalLink
	}

	return null
}
