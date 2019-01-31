import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import push from './push'

export default async function (options: { token: vscode.CancellationToken }) {
	track('fetch')

	const updated = await fetchInternal(options.token)
	if (updated === null) {
		return null
	}

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
		return null
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
					break
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
		return null
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
			vscode.window.showErrorMessage(`The operation was cancelled because the branch status has changed.`, { modal: true })
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
		// Check if the local branch can be safely reset to its remote branch
		const groups = await Git.getBranchTopology(workspace.uri, status.local, status.remote)
		if (groups.length === 2 && status.dirty === false) {
			const [localGroup, remoteGroup] = groups
			if (
				remoteGroup.length >= localGroup.length &&
				localGroup.every((localCommit, index) => {
					const remoteCommit = remoteGroup[index]
					return remoteCommit.author === localCommit.author && localCommit.message === remoteCommit.message
				}) &&
				_.isEqual(
					await Git.run(workspace.uri, 'diff', '--raw', localGroup[0].parentHash, localGroup[localGroup.length - 1].commitHash),
					await Git.run(workspace.uri, 'diff', '--raw', remoteGroup[0].parentHash, remoteGroup[localGroup.length - 1].commitHash)
				)
			) {
				const select = await vscode.window.showWarningMessage(
					`The local branch "${status.local}" can be safely reset to its remote branch.`,
					'Reset Branch')
				if (select) {
					await abortIfStatusHasChanged()

					await Git.run(workspace.uri, 'reset', '--hard', _.last(remoteGroup).commitHash)
				}
				return null
			}
		}

		const select = await vscode.window.showWarningMessage(
			`The local branch "${status.local}" is out of sync with its remote branch by ${status.distance} commit${status.distance === 1 ? '' : 's'}.`,
			'Rebase Now', 'Merge Now')
		if (!select) {
			return null
		}

		await abortIfStatusHasChanged()

		if (select === 'Rebase Now') {
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
