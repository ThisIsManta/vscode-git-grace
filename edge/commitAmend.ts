import truncate from 'lodash/truncate'
import * as vscode from 'vscode'

import * as Git from './Git'
import { track } from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const commit = await Git.getLastCommit(workspace.uri)

	const select = await vscode.window.showInformationMessage(
		`Last commit is "${truncate(commit.message, { length: 60 })}"`,
		{ modal: true },
		'Amend Last Commit',
	)

	if (!select) {
		throw new vscode.CancellationError()
	}

	track('commit-amend')

	await vscode.commands.executeCommand('git.undoCommit')
	await vscode.commands.executeCommand('workbench.view.scm')
}
