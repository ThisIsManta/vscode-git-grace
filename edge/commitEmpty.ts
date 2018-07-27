import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const root = await Shared.getCurrentRoot()
	if (!root) {
		return null
	}

	const select = await vscode.window.showWarningMessage(
		`Are you sure you want to create an empty commit?`,
		{ modal: true }, 'Create an Empty Commit')
	if (!select) {
		return null
	}

	try {
		await Shared.git(root.uri, 'commit', '--allow-empty', '--message=(empty commit)')

	} catch (ex) {
		Shared.setRootAsFailure(root)

		throw `Committing failed.`
	}

	vscode.window.setStatusBarMessage(`Committing completed`, 10000)

	vscode.commands.executeCommand('git.refresh')
}