import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const workspace = await Shared.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.commands.executeCommand('git.refresh')

	const status = await Shared.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		await vscode.commands.executeCommand('git.commit')

		const statusAfterCommitCommand = await Shared.getCurrentBranchStatus(workspace.uri)
		if (statusAfterCommitCommand.dirty) {
			return null
		}
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Syncing...' }, async () => {
		try {
			if (status.remote === '') {
				await Shared.git(workspace.uri, 'push', 'origin', status.local)
				await Shared.setRemoteBranch(workspace.uri, status.local)
			}

			await Shared.git(workspace.uri, 'pull', '--all', '--rebase')
			await Shared.git(workspace.uri, 'push', '--all')
			await Shared.git(workspace.uri, 'push', '--tags')

		} catch (ex) {
			Shared.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Syncing failed.`
		}

		vscode.window.setStatusBarMessage(`Syncing completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}