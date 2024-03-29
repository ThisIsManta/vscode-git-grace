import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import compact from 'lodash/compact'
import chunk from 'lodash/chunk'
import first from 'lodash/first'
import last from 'lodash/last'
import trim from 'lodash/trim'
import escapeRegExp from 'lodash/escapeRegExp'
import * as vscode from 'vscode'

import * as GitBuiltInExtension from './GitBuiltInExtension.d'
import Log from './Log'
import sleep from './sleep'

export function getGitBuiltInExtension() {
	return vscode.extensions.getExtension<GitBuiltInExtension.GitExtension>('vscode.git')
}

let gitExecutablePath = ''

interface Options {
	retry?: number
	token?: vscode.CancellationToken
}

export async function run(link: vscode.Uri, ...formalParameters: Array<string | Options>) {
	const parameters = formalParameters.filter(parameter => typeof parameter === 'string' && parameter.trim().length > 0) as Array<string>
	const options = (formalParameters.find(parameter => typeof parameter === 'object' && parameter !== null) || {}) as Options

	let count = options.retry || 0
	while (true) {
		if (options.token && options.token.isCancellationRequested) {
			return ''
		}

		try {
			return await runInternal(link, parameters, options.token)

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

const runInternal = (link: vscode.Uri, formalParameters: Array<string>, token?: vscode.CancellationToken) => new Promise<string>(async (resolve, reject) => {
	const actualParameters = ['--no-pager', ...formalParameters]

	Log.appendLine('git ' + actualParameters.join(' '))

	if (gitExecutablePath === '') {
		gitExecutablePath = await getGitBuiltInExtension().exports.getAPI(1).git.path
	}

	const pipe = cp.spawn(gitExecutablePath, actualParameters, { cwd: getRepositoryLink(link).fsPath.replace(/\\/g, fp.posix.sep) })

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
			reject(outputBuffer)
		}
	})
})

const repositoryCache = new Map<string, vscode.Uri>()

export function getRepositoryLink(link: vscode.Uri) {
	if (!link) {
		return null
	}

	const directoryPath = fp.dirname(link.fsPath)
	if (repositoryCache.has(directoryPath)) {
		return repositoryCache.get(directoryPath)
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

export async function getLocalBranchNames(link: vscode.Uri) {
	const result = await run(link, 'branch', '--list')
	return compact(
		result.split('\n')
			.map(line => line.startsWith('*') ? line.substring(1) : line)
			.map(line => line.trim())
	)
}

export async function getRemoteBranchNames(link: vscode.Uri) {
	const result = await run(link, 'branch', '--list', '--remotes')
	return compact(
		result
			.split('\n')
			.map(line => line.trim())
			.flatMap(line => line.split(' -> '))
	)
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
			remote: remote.replace(/^refs\/remotes\//, '') || null
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
	distance: number
}

export async function getCurrentBranchStatus(link: vscode.Uri): Promise<BranchStatus> {
	const status = await run(link, 'status', '--short', '--branch')

	const chunk = status.split('\n')[0].substring(3).trim()
	const dirty = status.trim().split('\n').length > 1

	if (chunk.includes('(no branch)')) {
		return { local: '', remote: '', dirty, sync: SyncStatus.LocalIsInSyncWithRemote, distance: 0 }
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

	let sync = SyncStatus.LocalIsInSyncWithRemote
	let distance = 0
	if (local && remote) {
		const result = await run(link, 'rev-list', '--left-right', '--count', local + '...' + remote)
		const [left, right] = result.match(/(\d+)\s+(\d+)/).slice(1).map(numb => parseInt(numb))
		if (left > 0 && right > 0) {
			sync = SyncStatus.LocalIsNotInSyncWithRemote
		} else if (left > 0) {
			sync = SyncStatus.LocalIsAheadOfRemote
		} else if (right > 0) {
			sync = SyncStatus.LocalIsBehindRemote
		}
		distance = left + right
	}

	return { local, remote, dirty, sync, distance }
}

export async function getFileStatus(link: vscode.Uri) {
	const repositoryLink = await getRepositoryLink(link)

	const status = await run(link, 'status', '--short')
	return status.split('\n')
		.filter(line => line.trim().length > 0)
		.map(line => ({
			symbol: line.substring(0, 2).trim(),
			currentLink: vscode.Uri.file(fp.join(repositoryLink.fsPath, last(line.substring(3).split('->')).trim())),
			originalLink: vscode.Uri.file(fp.join(repositoryLink.fsPath, first(line.substring(3).split('->')).trim())),
		}))
		.find(file => file.currentLink.fsPath === link.fsPath)
}

export async function getBranchTopology(link: vscode.Uri, localBranchName: string, remoteBranchName: string) {
	const result = await run(link, 'rev-list', '--topo-order', '--left-right', localBranchName + '...' + remoteBranchName, '--format=format:%P%n%aE%n%aI%n%f')
	if (result.trim() === '') {
		return []
	}
	const commits = chunk(result.trim().split('\n'), 5).map(([commit, parentHash, email, date, message]) => {
		const directionAndCommitHash = commit.match(/(<|>)(\w{40})/) // First line is always be "commit >X" where X is a 40-character-long commit hash
		return {
			email,
			date,
			message,
			parentHash,
			direction: directionAndCommitHash[1],
			commitHash: directionAndCommitHash[2],
		}
	})
	const groups = [[commits[0]]]
	let index = 0
	while (++index < commits.length) {
		if (commits[index].direction === last(groups)[0].direction) {
			last(groups).push(commits[index])
		} else {
			groups.push([commits[index]])
		}
	}
	return groups
}

const gitPattern = /^\turl\s*=\s*git@(.+)\.git/
const urlPattern = /^\turl\s*=\s*(.+)\.git$/

export function getWebOrigin(workspace: vscode.WorkspaceFolder) {
	const repositoryPath = getRepositoryLink(workspace.uri).fsPath
	const confPath = fp.join(repositoryPath, '.git', 'config')
	if (!fs.existsSync(confPath)) {
		return null
	}

	const confFile = fs.readFileSync(confPath, 'utf-8')
	const confLine = compact(confFile.split('\n'))
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

export async function getFileBeforeRenamed(link: vscode.Uri) {
	const repositoryLink = getRepositoryLink(link)
	const relativeCurrentFilePath = trim(link.fsPath.substring(repositoryLink.fsPath.length), fp.sep)

	let status = await getFileStatus(link)
	if (status === undefined) {
		return null
	}

	if (status.symbol === '??') {
		await run(link, 'add', relativeCurrentFilePath.replace(/\\/g, '/'))
		status = await getFileStatus(link)
	}

	if (status.symbol === 'R' && status.currentLink.fsPath === link.fsPath) {
		return status.originalLink
	}

	return null
}
