import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'
import { tryToSyncRemoteBranch } from './fetch'

export default async function () {
	const rootList = Shared.getRootList()
	if (rootList.length === 0) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Pushing...' }, async (progress) => {
		let repoGotUpdated = false

		for (const root of rootList) {
			if (rootList.length > 1) {
				progress.report({ message: `Pushing "${root.name}"...` })
			}

			const status = await Shared.getCurrentBranchStatus(root.uri)
			if (status.local === '') {
				throw `Workspace "${root.name}" was not on any branch.`
			}

			if (status.remote && status.sync === Shared.SyncStatus.OutOfSync) {
				const select = await vscode.window.showWarningMessage(
					`The local branch "${status.local}" could not be pushed because it was out of sync with its remote branch.`,
					{ modal: true }, 'Force Pushing')
				if (!select) {
					return null
				}
			}

			try {
				const result = await Shared.retry(1, () => Shared.git(root.uri, 'push', '--tags', status.sync === Shared.SyncStatus.OutOfSync && '--force-with-lease', 'origin', status.local))
				if (result.trim() !== 'Everything up-to-date') {
					repoGotUpdated = true
				}

			} catch (ex) {
				Shared.setRootAsFailure(root)

				if (ex.includes('Updates were rejected because the tip of your current branch is behind') && ex.includes('its remote counterpart.')) {
					await Shared.git(root.uri, 'fetch', 'origin', status.local)

					_.defer(async () => {
						await vscode.window.showErrorMessage(`The local branch "${status.local}" could not be pushed because its remote branch has been moved.`, { modal: true })

						tryToSyncRemoteBranch(root)
					})

					return null
				}

				throw `Pushing failed.`
			}
		}

		if (repoGotUpdated) {
			vscode.window.setStatusBarMessage(`Pushing completed`, 10000)
		} else {
			vscode.window.setStatusBarMessage(`No updates`, 10000)
		}

		vscode.commands.executeCommand('git.refresh')

		return true
	})
}