import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const workspaceList = Shared.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Pulling...' }, async () => {
		for (const workspace of workspaceList) {
			try {
				await Shared.retry(2, () => Shared.git(workspace.uri, 'fetch', '--prune', 'origin'))

				const status = await Shared.getCurrentBranchStatus(workspace.uri)
				if (status.local === '' || status.remote === '') {
					continue
				}

				await Shared.git(workspace.uri, 'rebase')

			} catch (ex) {
				Shared.setWorkspaceAsFirstTryNextTime(workspace)

				throw `Pulling failed.`
			}
		}

		vscode.window.setStatusBarMessage(`Pulling completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}