import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as parseDiff from 'git-diff-parser'

import * as Util from './Util'
import * as Git from './Git'
import push from './push'
import { track } from './Amplitude'

export default async function (options: { token: vscode.CancellationToken }) {
	track('fetch')

	const updated = await fetchInternal(options.token)

	const workspace = await Util.getCurrentWorkspace()
	if (workspace) {
		// Do not wait for the optional operation
		trySyncRemoteBranch(workspace)
	}

	if (updated) {
		vscode.window.setStatusBarMessage(`Fetching completed`, 10000)
	} else {
		vscode.window.setStatusBarMessage(`No updates`, 10000)
	}

	vscode.commands.executeCommand('git.refresh')
}

export async function fetchInternal(token?: vscode.CancellationToken) {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return false
	}

	let updated = false

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Fetching...' }, async (progress) => {
		for (const workspace of workspaceList) {
			if (workspaceList.length > 1) {
				progress.report({ message: `Fetching "${workspace.name}"...` })
			}

			try {
				const result = await Git.run(workspace.uri, 'fetch', '--prune', 'origin', { token, retry: 2 })

				if (token && token.isCancellationRequested) {
					throw null
				}

				if (result.trim().length > 0) {
					updated = true
				}

			} catch (ex) {
				Util.setWorkspaceAsFirstTryNextTime(workspace)

				if (workspaceList.length > 1) {
					throw `Fetching "${workspace.name}" failed.`
				} else {
					throw `Fetching failed.`
				}
			}
		}
	})

	if (token && token.isCancellationRequested) {
		throw null
	}

	return updated
}

export async function trySyncRemoteBranch(workspace: vscode.WorkspaceFolder) {
	if (!workspace) {
		return false
	}

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.local === '' || status.remote === '' || status.sync === Git.SyncStatus.LocalIsInSyncWithRemote) {
		return false
	}

	async function abortIfStatusHasChanged() {
		const newStatus = await Git.getCurrentBranchStatus(workspace.uri)
		delete newStatus.distance
		if (_.isMatch(status, newStatus) === false) {
			vscode.window.showErrorMessage(`The fetch operation was cancelled because the branch status has changed.`, { modal: true })
			throw null
		}
	}

	if (status.sync === Git.SyncStatus.LocalIsBehindRemote) {
		const select = await vscode.window.showWarningMessage(
			`The local branch "${status.local}" is behind its remote branch by ${status.distance} commit${status.distance === 1 ? '' : 's'}.`,
			'Fast Forward')
		if (!select) {
			return null
		}

		track('fetch:fast-forward')

		await abortIfStatusHasChanged()

		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Fast Forwarding...' }, async () => {
			try {
				await Git.run(workspace.uri, 'rebase', '--autostash', status.remote)

				await vscode.commands.executeCommand('git.refresh')

				vscode.window.setStatusBarMessage(`Fast forwarding completed`, 10000)

			} catch (ex) {
				Util.setWorkspaceAsFirstTryNextTime(workspace)

				vscode.window.showErrorMessage(`Fast forwarding failed.`, { modal: true })
				return false
			}
		})

	} else if (status.sync === Git.SyncStatus.LocalIsAheadOfRemote) {
		const select = await vscode.window.showWarningMessage(
			`The local branch "${status.local}" can be safely pushed ${status.distance} commit${status.distance === 1 ? '' : 's'} to its remote branch.`,
			'Push Now')
		if (!select) {
			return null
		}

		track('fetch:push-now')

		await abortIfStatusHasChanged()

		return await push({ location: vscode.ProgressLocation.Notification })

	} else if (status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote) {
		const groups = await Git.getBranchTopology(workspace.uri, status.local, status.remote)
		const [localCommits, remoteCommits] = _.chain(groups)
			.filter(commits => commits.length > 0)
			.sortBy(commits => commits[0].direction === '<' ? 0 : 1 /* Put local commits first */)
			.map(commits => _.sortBy(commits, commit => commit.date /* Put older commits first */))
			.value()

		let select: string
		if (
			localCommits && remoteCommits &&
			await checkIfRemoteContainsLocalChanges(workspace.uri, _.first(localCommits).parentHash, _.last(localCommits).commitHash, _.last(remoteCommits).commitHash)
		) {
			select = await vscode.window.showWarningMessage(
				`The local branch "${status.local}" can be safely reset to the tip of its remote branch.`,
				'Reset Branch')

		} else {
			select = await vscode.window.showWarningMessage(
				`The local branch "${status.local}" is out of sync with its remote branch by ${status.distance} commit${status.distance === 1 ? '' : 's'}.`,
				'Rebase Now', 'Merge Now', 'Reset Branch')
		}

		if (!select) {
			return null
		}

		await abortIfStatusHasChanged()

		if (select === 'Reset Branch') {
			await abortIfStatusHasChanged()

			await Git.run(workspace.uri, 'reset', '--hard', _.last(remoteCommits).commitHash)

			await vscode.commands.executeCommand('git.refresh')

			vscode.window.setStatusBarMessage(`Resetting completed`, 10000)

		} else if (select === 'Rebase Now') {
			track('fetch:rebase-now')

			await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Rebasing...' }, async () => {
				try {
					await Git.run(workspace.uri, 'rebase', '--autostash', status.remote)

					await vscode.commands.executeCommand('git.refresh')

					vscode.window.setStatusBarMessage(`Rebasing completed`, 10000)

				} catch (ex) {
					Util.setWorkspaceAsFirstTryNextTime(workspace)

					if (String(ex).includes('CONFLICT')) {
						await Git.run(workspace.uri, 'rebase', '--abort')

						vscode.window.showErrorMessage(`Rebasing was cancelled due to conflicts. Please do it manually.`, { modal: true })

					} else {
						vscode.window.showErrorMessage(`Rebasing was cancelled due to an unknown error. Please do it manually.`, { modal: true })
					}

					return false
				}
			})

		} else {
			track('fetch:merge-now')

			await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Merging...' }, async () => {
				try {
					await Git.run(workspace.uri, 'merge', status.remote)

					await vscode.commands.executeCommand('git.refresh')

					vscode.window.setStatusBarMessage(`Merging completed`, 10000)

				} catch (ex) {
					Util.setWorkspaceAsFirstTryNextTime(workspace)

					if (String(ex).includes('CONFLICT')) {
						await Git.run(workspace.uri, 'merge', '--abort')

						vscode.window.showErrorMessage(`Merging was cancelled due to conflicts. Please do it manually.`, { modal: true })

					} else {
						vscode.window.showErrorMessage(`Merging was cancelled due to an unknown error. Please do it manually.`, { modal: true })
					}

					return false
				}
			})
		}
	}

	return true
}

type GitDiffFile = {
	added: boolean
	binary: boolean
	deleted: boolean
	renamed: boolean
	name: string
	index: [string, string, string]
	lines: Array<{ break: boolean, ln1: number, ln2?: number, text: string, type: string }>
}

/**
 * Returns true if and only if the secondCommitHash contains all the change in firstCommitHash.
 */
async function checkIfRemoteContainsLocalChanges(link: vscode.Uri, baseCommitHash: string, localCommitHash: string, remoteCommitHash: string) {
	const a: Array<GitDiffFile> = parseDiff(
		await Git.run(link, 'diff', baseCommitHash, localCommitHash)
	).commits[0].files
	const b: Array<GitDiffFile> = parseDiff(
		await Git.run(link, 'diff', baseCommitHash, remoteCommitHash)
	).commits[0].files

	for (const fa of a) {
		const fb = b.find(f => f.name === fa.name)
		if (fb === undefined) {
			return false
		}

		if (fa.binary !== fb.binary) {
			return false
		}

		if (fa.added !== fb.added) {
			return false
		}

		if (fa.deleted !== fb.deleted && !fb.renamed) {
			return false
		}

		const la = fa.lines.filter(f => f.type !== 'normal').map(l => _.omit(l, 'ln2'))
		const lb = fb.lines.filter(f => f.type !== 'normal').map(l => _.omit(l, 'ln2'))
		if (_.differenceWith(la, lb, _.isEqual).length > 0) {
			return false
		}
	}

	return true
}
