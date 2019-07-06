import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { track } from './Amplitude'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const commit = await Git.getLastCommit(workspace.uri)

	const select = await vscode.window.showWarningMessage(
		`Are you sure you want to amend last commit "${_.truncate(commit.message, { length: 60 })}"?`,
		{ modal: true }, 'Amend Last Commit')
	if (!select) {
		throw null
	}

	track('commit-amend')

	await vscode.commands.executeCommand('git.undoCommit')
	await vscode.commands.executeCommand('workbench.view.scm')
}