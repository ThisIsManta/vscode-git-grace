import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
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
		await Git.run(workspace.uri, 'commit', '--allow-empty', '--message=(empty commit)')

	} catch (ex) {
		Util.setWorkspaceAsFirstTryNextTime(workspace)

		throw `Committing failed.`
	}

	track('commit-empty')

	vscode.window.setStatusBarMessage(`Committing completed`, 10000)

	vscode.commands.executeCommand('git.refresh')
}