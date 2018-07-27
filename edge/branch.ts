import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const workspace = await Shared.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const status = await Shared.getCurrentBranchStatus(workspace.uri)
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
				const newStatus = await Shared.getCurrentBranchStatus(workspace.uri)
				await Shared.git(workspace.uri, 'branch', '--unset-upstream', newStatus.local)
			}
		}
	}
}