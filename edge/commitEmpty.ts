import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { track } from './Amplitude'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const select = await vscode.window.showWarningMessage(
		`Are you sure you want to create an empty commit?`,
		{ modal: true }, 'Create an Empty Commit')
	if (!select) {
		throw null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, async () => {
		try {
			await Git.run(workspace.uri, 'commit', '--allow-empty', '--message=(empty commit)')

		} catch (ex) {
			Util.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Committing failed.`
		}
	})

	track('commit-empty')

	await vscode.commands.executeCommand('git.refresh')
}