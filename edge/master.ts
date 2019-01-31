import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { tryAbortBecauseOfDirtyFiles, tryAbortBecauseOfDanglingCommits } from './checkout'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty && await tryAbortBecauseOfDirtyFiles(workspace.uri)) {
		return null
	}

	await Git.run(workspace.uri, 'fetch', 'origin', { retry: 2 })

	const currentHash = await Git.getCommitHash(workspace.uri)
	const masterHash = await Git.getCommitHash(workspace.uri, 'origin/master')
	if (currentHash === masterHash) {
		vscode.window.showInformationMessage(`You are on "origin/master" already.`)
		return null
	}

	if (status.local === '' && await tryAbortBecauseOfDanglingCommits(workspace.uri, '"origin/master"')) {
		return null
	}

	track('master')

	try {
		await Git.run(workspace.uri, 'checkout', '--detach', 'origin/master')

	} catch (ex) {
		throw `Checking out "origin/master" failed.`
	}

	vscode.commands.executeCommand('git.refresh')
}
