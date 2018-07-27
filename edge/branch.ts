import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (!status.local || status.local === 'master') {
		return vscode.commands.executeCommand('git.branch')

	} else {
		const options: Array<vscode.MessageItem> = [{ title: 'Create New Branch' }, { title: 'Rename Current Branch' }]
		const select = await vscode.window.showWarningMessage(
			`You are on the local branch "${status.local}".`,
			{ modal: true }, ...options)
		if (select === options[0]) {
			return vscode.commands.executeCommand('git.branch')

		} else if (select === options[1]) {
			await vscode.commands.executeCommand('git.renameBranch')

			if (status.remote) {
				const newStatus = await Git.getCurrentBranchStatus(workspace.uri)
				await Git.run(workspace.uri, 'branch', '--unset-upstream', newStatus.local)
			}
		}
	}
}