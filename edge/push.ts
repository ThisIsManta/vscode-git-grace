import defer from 'lodash/defer'
import * as vscode from 'vscode'

import * as Git from './Git'
import { track } from './Telemetry'
import * as Util from './Utility'

export default async function (options: {
	location?: vscode.ProgressLocation
	token?: vscode.CancellationToken
} = {}): Promise<boolean> {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return false
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	let force = false

	const updated = await vscode.window.withProgress({
		location: options.location || vscode.ProgressLocation.Window,
		title: 'Pushing...',
	}, async progress => {
		let updated = false
		for (const workspace of workspaceList) {
			if (workspaceList.length > 1) {
				progress.report({ message: `Pushing "${workspace.name}"...` })
			}

			if (options.token && options.token.isCancellationRequested) {
				throw new vscode.CancellationError()
			}

			const status = await Git.getCurrentBranchStatus(workspace.uri)
			if (status.local === '') {
				throw new Error(`Workspace "${workspace.name}" was not on any branch.`)
			}

			if (options.token && options.token.isCancellationRequested) {
				throw new vscode.CancellationError()
			}

			if (status.remote && status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote) {
				const select = await vscode.window.showWarningMessage(
					`The local branch "${status.local}" could not be pushed because it was out of sync with its remote branch.`,
					{ modal: true },
					'Force Pushing',
				)

				if (!select) {
					throw new vscode.CancellationError()
				}

				force = true
			}

			try {
				const result = await Git.run(workspace.uri, 'push', status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote ? '--force-with-lease' : '', 'origin', status.local, { token: options.token })
				if (options.token && options.token.isCancellationRequested) {
					throw new vscode.CancellationError()
				}

				if (result.trim() !== 'Everything up-to-date') {
					updated = true
				}

			} catch (error) {
				if (options.token && options.token.isCancellationRequested) {
					throw new vscode.CancellationError()
				}

				Util.setWorkspaceAsFirstTryNextTime(workspace)

				if (error instanceof Git.GitError && error.message.includes('error: failed to push some refs')) {
					if (error.message.includes('error: GH006: Protected branch update failed')) {
						throw new Error(`Pushing failed because the remote branch "${status.remote || status.local}" is protected.`)
					}

					await Git.run(workspace.uri, 'fetch', 'origin', status.local, { token: options.token })

					if (options.token && options.token.isCancellationRequested) {
						throw new vscode.CancellationError()
					}

					throw new Error(`Pushing failed because the remote branch "${status.remote || status.local}" has been moved.`)
				}

				throw new Error('Pushing failed.')
			}
		}

		return updated
	})

	await vscode.commands.executeCommand('git.refresh')

	track('push', { force: String(force) })

	if (updated) {
		vscode.window.setStatusBarMessage('Pushing completed', 10000)

	} else {
		vscode.window.setStatusBarMessage('No updates', 10000)
	}

	return updated
}
