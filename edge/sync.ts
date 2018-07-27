import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.commands.executeCommand('git.refresh')

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		await vscode.commands.executeCommand('git.commit')

		const statusAfterCommitCommand = await Git.getCurrentBranchStatus(workspace.uri)
		if (statusAfterCommitCommand.dirty) {
			return null
		}
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Syncing...' }, async () => {
		try {
			if (status.remote === '') {
				await Git.run(workspace.uri, 'push', 'origin', status.local)
				await Git.setRemoteBranch(workspace.uri, status.local)
			}

			await Git.run(workspace.uri, 'pull', '--all', '--rebase')
			await Git.run(workspace.uri, 'push', '--all')
			await Git.run(workspace.uri, 'push', '--tags')

		} catch (ex) {
			Util.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Syncing failed.`
		}

		vscode.window.setStatusBarMessage(`Syncing completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}