import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'
import push from './push'

export default async function () {
	const updated = await fetchInternal()
	if (updated === null) {
		return null
	}

	const workspace = await Shared.getCurrentWorkspace()
	if (workspace) {
		// Do not wait for optional operation
		tryToSyncRemoteBranch(workspace)
	}

	if (updated) {
		vscode.window.setStatusBarMessage(`Fetching completed`, 10000)
	} else {
		vscode.window.setStatusBarMessage(`No updates`, 10000)
	}

	vscode.commands.executeCommand('git.refresh')
}

export async function fetchInternal() {
	const workspaceList = Shared.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	let updated = false

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Fetching...' }, async (progress) => {
		for (const workspace of workspaceList) {
			if (workspaceList.length > 1) {
				progress.report({ message: `Fetching "${workspace.name}"...` })
			}

			try {
				const result = await Shared.retry(2, () => Shared.git(workspace.uri, 'fetch', '--prune', 'origin'))
				if (result.trim().length > 0) {
					updated = true
				}

			} catch (ex) {
				Shared.setWorkspaceAsFirstTryNextTime(workspace)

				if (workspaceList.length > 1) {
					throw `Fetching "${workspace.name}" failed.`
				} else {
					throw `Fetching failed.`
				}
			}
		}
	})

	return updated
}

export async function tryToSyncRemoteBranch(root: vscode.WorkspaceFolder) {
	if (!root) {
		return false
	}

	const status = await Shared.getCurrentBranchStatus(root.uri)
	if (status.local === '' || status.remote === '' || status.sync === Shared.SyncStatus.InSync) {
		return false
	}

	async function abortIfStatusHasChanged() {
		const newStatus = await Shared.getCurrentBranchStatus(root.uri)
		delete newStatus.distance
		if (_.isMatch(status, newStatus) === false) {
			vscode.window.showErrorMessage(`The operation was cancelled because the branch status has changed.`, { modal: true })
			throw null
		}
	}

	if (status.sync === Shared.SyncStatus.Behind) {
		const select = await vscode.window.showWarningMessage(
			`The local branch "${status.local}" is behind its remote branch by ${status.distance} commit${status.distance === 1 ? '' : 's'}.`,
			'Fast Forward')
		if (!select) {
			return null
		}

		await abortIfStatusHasChanged()

		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Fast Forwarding...' }, async () => {
			try {
				await Shared.git(root.uri, 'rebase', '--autostash', status.remote)

				await vscode.commands.executeCommand('git.refresh')

				vscode.window.setStatusBarMessage(`Fast forwarding completed`, 10000)

			} catch (ex) {
				Shared.setWorkspaceAsFirstTryNextTime(root)

				vscode.window.showErrorMessage(`Fast forwarding failed.`, { modal: true })
				return false
			}
		})

	} else if (status.sync === Shared.SyncStatus.Ahead) {
		const select = await vscode.window.showWarningMessage(
			`The local branch "${status.local}" is ahead of its remote branch by ${status.distance} commit${status.distance === 1 ? '' : 's'}.`,
			'Push Now')
		if (!select) {
			return null
		}

		await abortIfStatusHasChanged()

		await push()

	} else if (status.sync === Shared.SyncStatus.OutOfSync) {
		const select = await vscode.window.showWarningMessage(
			`The local branch "${status.local}" is out of sync with its remote branch by ${status.distance} commit${status.distance === 1 ? '' : 's'}.`,
			'Rebase Now', 'Merge Now')
		if (!select) {
			return null
		}

		await abortIfStatusHasChanged()

		if (select === 'Rebase Now') {
			await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Rebasing...' }, async () => {
				try {
					await Shared.git(root.uri, 'rebase', '--autostash', status.remote)

					await vscode.commands.executeCommand('git.refresh')

					vscode.window.setStatusBarMessage(`Rebasing completed`, 10000)

				} catch (ex) {
					Shared.setWorkspaceAsFirstTryNextTime(root)

					if (String(ex).includes('CONFLICT')) {
						await Shared.git(root.uri, 'rebase', '--abort')

						vscode.window.showErrorMessage(`Rebasing was cancelled due to conflicts. Please do it manually.`, { modal: true })

					} else {
						vscode.window.showErrorMessage(`Rebasing was cancelled due to an unknown error. Please do it manually.`, { modal: true })
					}

					return false
				}
			})

		} else {
			await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Merging...' }, async () => {
				try {
					await Shared.git(root.uri, 'merge', status.remote)

					await vscode.commands.executeCommand('git.refresh')

					vscode.window.setStatusBarMessage(`Merging completed`, 10000)

				} catch (ex) {
					Shared.setWorkspaceAsFirstTryNextTime(root)

					if (String(ex).includes('CONFLICT')) {
						await Shared.git(root.uri, 'merge', '--abort')

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
