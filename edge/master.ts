import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { fetchInternal } from './fetch'
import stash from './stash'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		const select = await vscode.window.showWarningMessage(
			`The current repository is dirty.`,
			{ modal: true }, 'Stash Now', 'Discard All Files')
		if (!select) {
			return null
		}

		if (select === 'Stash Now') {
			const error = await stash()
			if (error !== undefined) {
				return null
			}

		} else if (select === 'Discard All Files') {
			try {
				await Git.run(workspace.uri, 'reset', '--hard')

			} catch (ex) {
				throw `Cleaning up files failed.`
			}
		}
	}

	await fetchInternal()

	const masterInfo = await Git.run(workspace.uri, 'rev-parse', 'origin/master')
	const masterHash = masterInfo.trim()
	const commitInfo = await Git.run(workspace.uri, 'status', '--branch', '--porcelain=2')
	if (masterHash === commitInfo) {
		vscode.window.showInformationMessage(`You are on "origin/master" already.`)
		return null
	}

	try {
		await Git.run(workspace.uri, 'checkout', '--detach', 'origin/master')

	} catch (ex) {
		throw `Checking out "origin/master" failed.`
	}

	vscode.commands.executeCommand('git.refresh')
}