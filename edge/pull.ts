import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { track } from './Amplitude'

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pulling...' }, async () => {
		for (const workspace of workspaceList) {
			try {
				await Git.run(workspace.uri, 'fetch', '--prune', 'origin', { retry: 2 })

				const status = await Git.getCurrentBranchStatus(workspace.uri)
				if (status.local === '' || status.remote === '') {
					continue
				}

				await Git.run(workspace.uri, 'rebase', '--no-stat')

			} catch (ex) {
				track('pull', { success: false })

				Util.setWorkspaceAsFirstTryNextTime(workspace)

				throw `Pulling failed.`
			}
		}

	})

	await vscode.commands.executeCommand('git.refresh')

	track('pull', { success: true })

	vscode.window.setStatusBarMessage(`Pulling completed`, 10000)
}