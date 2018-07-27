import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const root = await Shared.getCurrentRoot()
	if (!root) {
		return null
	}

	const commit = await Shared.getLastCommit(root.uri)

	const select = await vscode.window.showWarningMessage(
		`Are you sure you want to amend last commit "${_.truncate(commit.message, { length: 60 })}"?`,
		{ modal: true }, 'Amend Last Commit')
	if (!select) {
		return null
	}

	await vscode.commands.executeCommand('git.undoCommit')
	await vscode.commands.executeCommand('workbench.view.scm')
}