import * as vscode from 'vscode'

import { tryAbortBecauseOfDirtyFiles, tryAbortBecauseOfDanglingCommits } from './checkout'
import * as Git from './Git'
import { track } from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty && await tryAbortBecauseOfDirtyFiles(workspace.uri)) {
		return
	}

	const headBranchName = await Git.getRemoteHeadBranchName(workspace.uri)
	const remoteHeadBranchName = 'origin/' + headBranchName

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		title: `Switching to ${remoteHeadBranchName}...`,
	}, async () => {
		await Git.run(workspace.uri, 'fetch', 'origin', headBranchName, { retry: 2 })

		if (status.local === '') {
			const currentHash = await Git.getCurrentCommitHash(workspace.uri)
			const masterHash = await Git.getCurrentCommitHash(workspace.uri, remoteHeadBranchName)
			if (currentHash === masterHash) {
				vscode.window.showInformationMessage(`You are on "${remoteHeadBranchName}" already.`)

				return
			}

			if (await tryAbortBecauseOfDanglingCommits(workspace.uri, `"${remoteHeadBranchName}"`)) {
				return
			}
		}

		track('master')

		try {
			await Git.run(workspace.uri, 'checkout', '--detach', remoteHeadBranchName)

		} catch (error) {
			throw new Error(`Checking out "${remoteHeadBranchName}" failed.`)
		}

		vscode.commands.executeCommand('git.refresh')
	})
}
