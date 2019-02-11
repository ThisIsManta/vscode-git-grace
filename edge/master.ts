import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { tryAbortBecauseOfDirtyFiles, tryAbortBecauseOfDanglingCommits } from './checkout'
import { track } from './Amplitude'

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

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Switching to origin/master...' }, async () => {
		await Git.run(workspace.uri, 'fetch', 'origin', { retry: 2 })

		if (status.local === '') {
			const currentHash = await Git.getCommitHash(workspace.uri)
			const masterHash = await Git.getCommitHash(workspace.uri, 'origin/master')
			if (currentHash === masterHash) {
				vscode.window.showInformationMessage(`You are on "origin/master" already.`)
				return null
			}

			if (await tryAbortBecauseOfDanglingCommits(workspace.uri, '"origin/master"')) {
				return null
			}
		}

		track('master')

		try {
			await Git.run(workspace.uri, 'checkout', '--detach', 'origin/master')

		} catch (ex) {
			throw `Checking out "origin/master" failed.`
		}

		vscode.commands.executeCommand('git.refresh')
	})
}
