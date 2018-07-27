import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const root = await Shared.getCurrentRoot()
	if (!root) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.commands.executeCommand('git.refresh')

	const status = await Shared.getCurrentBranchStatus(root.uri)
	if (status.dirty) {
		await vscode.commands.executeCommand('git.commit')

		const statusAfterCommitCommand = await Shared.getCurrentBranchStatus(root.uri)
		if (statusAfterCommitCommand.dirty) {
			return null
		}
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Syncing...' }, async () => {
		try {
			if (status.remote === '') {
				await Shared.git(root.uri, 'push', 'origin', status.local)
				await Shared.setRemoteBranch(root.uri, status.local)
			}

			await Shared.git(root.uri, 'pull', '--all', '--rebase')
			await Shared.git(root.uri, 'push', '--all')
			await Shared.git(root.uri, 'push', '--tags')

		} catch (ex) {
			Shared.setRootAsFailure(root)

			throw `Syncing failed.`
		}

		vscode.window.setStatusBarMessage(`Syncing completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}