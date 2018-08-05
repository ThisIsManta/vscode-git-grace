import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { trySyncRemoteBranch } from './fetch'

export default async function (options: { location?: vscode.ProgressLocation } = {}) {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: options.location || vscode.ProgressLocation.Window, title: 'Pushing...' }, async (progress) => {
		let updated = false

		for (const workspace of workspaceList) {
			if (workspaceList.length > 1) {
				progress.report({ message: `Pushing "${workspace.name}"...` })
			}

			const status = await Git.getCurrentBranchStatus(workspace.uri)
			if (status.local === '') {
				throw `Workspace "${workspace.name}" was not on any branch.`
			}

			if (status.remote && status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote) {
				const select = await vscode.window.showWarningMessage(
					`The local branch "${status.local}" could not be pushed because it was out of sync with its remote branch.`,
					{ modal: true }, 'Force Pushing')
				if (!select) {
					return null
				}
			}

			try {
				const result = await Util.retry(1, () => Git.run(workspace.uri, 'push', '--tags', status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote && '--force-with-lease', 'origin', status.local))
				if (result.trim() !== 'Everything up-to-date') {
					updated = true
				}

			} catch (ex) {
				Util.setWorkspaceAsFirstTryNextTime(workspace)

				if (
					ex.includes('Updates were rejected because the tip of your current branch is behind') && ex.includes('its remote counterpart.') ||
					ex.includes('Updates were rejected because the remote contains work that you do') && ex.includes('not have locally.')
				) {
					await Git.run(workspace.uri, 'fetch', 'origin', status.local)

					_.defer(async () => {
						await vscode.window.showErrorMessage(`The local branch "${status.local}" could not be pushed because its remote branch has been moved.`, { modal: true })

						trySyncRemoteBranch(workspace)
					})

					return null
				}

				throw `Pushing failed.`
			}
		}

		if (updated) {
			vscode.window.setStatusBarMessage(`Pushing completed`, 10000)
		} else {
			vscode.window.setStatusBarMessage(`No updates`, 10000)
		}

		vscode.commands.executeCommand('git.refresh')

		return true
	})
}