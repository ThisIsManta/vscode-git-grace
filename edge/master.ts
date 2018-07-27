import * as vscode from 'vscode'

import * as Shared from './shared'
import { fetchInternal } from './fetch'
import stash from './stash'

export default async function () {
	const workspace = await Shared.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	const status = await Shared.getCurrentBranchStatus(workspace.uri)
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
				await Shared.git(workspace.uri, 'reset', '--hard')

			} catch (ex) {
				throw `Cleaning up files failed.`
			}
		}
	}

	await fetchInternal()

	const masterInfo = await Shared.git(workspace.uri, 'rev-parse', 'origin/master')
	const masterHash = masterInfo.trim()
	const commitInfo = await Shared.git(workspace.uri, 'status', '--branch', '--porcelain=2')
	if (masterHash === commitInfo) {
		vscode.window.showInformationMessage(`You are on "origin/master" already.`)
		return null
	}

	try {
		await Shared.git(workspace.uri, 'checkout', '--detach', 'origin/master')

	} catch (ex) {
		throw `Checking out "origin/master" failed.`
	}

	vscode.commands.executeCommand('git.refresh')
}