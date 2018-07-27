import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { tryToSyncRemoteBranch } from './fetch'

export default async function (options = { location: vscode.ProgressLocation.Window }) {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: options.location, title: 'Pushing...' }, async (progress) => {
		let updated = false

		for (const workspace of workspaceList) {
			if (workspaceList.length > 1) {
				progress.report({ message: `Pushing "${workspace.name}"...` })
			}

			const status = await Git.getCurrentBranchStatus(workspace.uri)
			if (status.local === '') {
				throw `Workspace "${workspace.name}" was not on any branch.`
			}

			if (status.remote && status.sync === Git.SyncStatus.OutOfSync) {
				const select = await vscode.window.showWarningMessage(
					`The local branch "${status.local}" could not be pushed because it was out of sync with its remote branch.`,
					{ modal: true }, 'Force Pushing')
				if (!select) {
					return null
				}
			}

			try {
				const result = await Util.retry(1, () => Git.run(workspace.uri, 'push', '--tags', status.sync === Git.SyncStatus.OutOfSync && '--force-with-lease', 'origin', status.local))
				if (result.trim() !== 'Everything up-to-date') {
					updated = true
				}

			} catch (ex) {
				Util.setWorkspaceAsFirstTryNextTime(workspace)

				if (ex.includes('Updates were rejected because the tip of your current branch is behind') && ex.includes('its remote counterpart.')) {
					await Git.run(workspace.uri, 'fetch', 'origin', status.local)

					_.defer(async () => {
						await vscode.window.showErrorMessage(`The local branch "${status.local}" could not be pushed because its remote branch has been moved.`, { modal: true })

						tryToSyncRemoteBranch(workspace)
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