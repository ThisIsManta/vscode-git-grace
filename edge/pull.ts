import * as vscode from 'vscode'

import * as Git from './Git'
import Telemetry from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return
	}

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		title: 'Pulling...',
	}, async () => {
		for (const workspace of workspaceList) {
			try {
				await Git.run(workspace.uri, 'fetch', '--prune', 'origin', { retry: 2 })

				const status = await Git.getCurrentBranchStatus(workspace.uri)
				if (status.local === '' || status.remote === '') {
					continue
				}

				await Git.run(workspace.uri, 'rebase', '--no-stat')

			} catch (error) {
				if (error instanceof Error) {
					Telemetry.logError(error)
				}

				Util.setWorkspaceAsFirstTryNextTime(workspace)

				throw new Error('Pulling failed.')
			}
		}
	})

	Telemetry.logUsage('pull')

	await vscode.commands.executeCommand('git.refresh')

	vscode.window.setStatusBarMessage('Pulling completed', 10000)
}
