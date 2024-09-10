import * as vscode from 'vscode'

import * as Git from './Git'
import { track } from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const select = await vscode.window.showWarningMessage(
		'Are you sure you want to create an empty commit?',
		{ modal: true },
		'Create an Empty Commit',
	)

	if (!select) {
		throw new vscode.CancellationError()
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, async () => {
		try {
			await Git.run(workspace.uri, 'commit', '--allow-empty', '--message=(empty commit)')

		} catch (error) {
			Util.setWorkspaceAsFirstTryNextTime(workspace)

			throw new Error('Committing failed.')
		}
	})

	track('commit-empty')

	await vscode.commands.executeCommand('git.refresh')
}
