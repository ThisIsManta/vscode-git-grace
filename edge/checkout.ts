import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'
import { fetchInternal, tryToSyncRemoteBranch } from './fetch'

export default async function () {
	const root = await Shared.getCurrentRoot()
	const oldStatus = await Shared.getCurrentBranchStatus(root.uri)

	let switchingDialogIsClosed = false
	vscode.commands.executeCommand('git.checkout').then(async () => {
		switchingDialogIsClosed = true

		const newStatus = await Shared.getCurrentBranchStatus(root.uri)
		if (oldStatus.local !== newStatus.local) {
			// Do not wait for optional operation
			tryToSyncRemoteBranch(root)
		}
	})

	// Do lazy fetching
	fetchInternal().then(async (repoGotUpdated: boolean) => {
		if (switchingDialogIsClosed || !repoGotUpdated) {
			return null
		}

		await vscode.commands.executeCommand('git.refresh')

		await vscode.commands.executeCommand('git.checkout')

		const newStatus = await Shared.getCurrentBranchStatus(root.uri)
		if (oldStatus.local !== newStatus.local) {
			// Do not wait for optional operation
			tryToSyncRemoteBranch(root)
		}
	})
}