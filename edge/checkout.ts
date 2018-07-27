import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { fetchInternal, tryToSyncRemoteBranch } from './fetch'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const oldStatus = await Git.getCurrentBranchStatus(workspace.uri)
	let switchingDialogIsClosed = false

	vscode.commands.executeCommand('git.checkout').then(async () => {
		switchingDialogIsClosed = true

		const newStatus = await Git.getCurrentBranchStatus(workspace.uri)
		if (oldStatus.local !== newStatus.local) {
			// Do not wait for optional operation
			tryToSyncRemoteBranch(workspace)
		}
	})

	// Do lazy fetching
	fetchInternal().then(async (updated: boolean) => {
		if (switchingDialogIsClosed || !updated) {
			return null
		}

		await vscode.commands.executeCommand('git.refresh')

		await vscode.commands.executeCommand('git.checkout')

		const newStatus = await Git.getCurrentBranchStatus(workspace.uri)
		if (oldStatus.local !== newStatus.local) {
			// Do not wait for optional operation
			tryToSyncRemoteBranch(workspace)
		}
	})
}