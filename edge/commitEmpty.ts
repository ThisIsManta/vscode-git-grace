import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const workspace = await Shared.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const select = await vscode.window.showWarningMessage(
		`Are you sure you want to create an empty commit?`,
		{ modal: true }, 'Create an Empty Commit')
	if (!select) {
		return null
	}

	try {
		await Shared.git(workspace.uri, 'commit', '--allow-empty', '--message=(empty commit)')

	} catch (ex) {
		Shared.setWorkspaceAsFirstTryNextTime(workspace)

		throw `Committing failed.`
	}

	vscode.window.setStatusBarMessage(`Committing completed`, 10000)

	vscode.commands.executeCommand('git.refresh')
}