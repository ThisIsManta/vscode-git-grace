import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const root = await Shared.getCurrentRoot()
	if (!root) {
		return null
	}

	const status = await Shared.getCurrentBranchStatus(root.uri)
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
				const newStatus = await Shared.getCurrentBranchStatus(root.uri)
				await Shared.git(root.uri, 'branch', '--unset-upstream', newStatus.local)
			}
		}
	}
}