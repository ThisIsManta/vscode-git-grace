import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { fetchInternal } from './fetch'
import { tryCleanUpRepository } from './checkout'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty && await tryCleanUpRepository(workspace.uri) !== true) {
		return null
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