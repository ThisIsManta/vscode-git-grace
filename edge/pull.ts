import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pulling...' }, async () => {
		for (const workspace of workspaceList) {
			try {
				await Util.retry(2, () => Git.run(workspace.uri, 'fetch', '--prune', 'origin'))

				const status = await Git.getCurrentBranchStatus(workspace.uri)
				if (status.local === '' || status.remote === '') {
					continue
				}

				await Git.run(workspace.uri, 'rebase')

			} catch (ex) {
				Util.setWorkspaceAsFirstTryNextTime(workspace)

				throw `Pulling failed.`
			}
		}

		vscode.window.setStatusBarMessage(`Pulling completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}