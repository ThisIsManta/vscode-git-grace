import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { getMergedBranchNames } from './deleteMergedBranches'

export default async function (options: { token: vscode.CancellationToken }) {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.commands.executeCommand('git.refresh')

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		await vscode.commands.executeCommand('git.commit')

		const statusAfterCommitCommand = await Git.getCurrentBranchStatus(workspace.uri)
		if (statusAfterCommitCommand.dirty) {
			return null
		}
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Syncing...' }, async ({ report }) => {
		try {
			if (status.remote === '') {
				await Git.run(workspace.uri, 'push', 'origin', status.local, { retry: 1 })
				await Git.setRemoteBranch(workspace.uri, status.local)
			}

			await Git.run(workspace.uri, 'push', '--tags', { retry: 1 })

			await Git.run(workspace.uri, 'pull', '--all', '--rebase')

			const counterparts = await Git.getBranchCounterparts(workspace.uri)
			const remoteBranches = new Set(await Git.getRemoteBranchNames(workspace.uri))
			const mergedBranches = new Set(await getMergedBranchNames(workspace.uri, false))
			for (const { local, remote } of counterparts) {
				if (local === status.local) {
					continue
				}

				if (remoteBranches.has(remote)) {
					const groups = await Git.getBranchTopology(workspace.uri, local, remote)
					if (groups.length === 2) {
						await Git.run(workspace.uri, 'push', 'origin', local, { retry: 1 })
					}

				} else if (mergedBranches.has(local)) {
					await Git.run(workspace.uri, 'branch', '--delete', '--force', local, { retry: 1 })

				} else {
					await Git.run(workspace.uri, 'push', 'origin', local, { retry: 1 })
					await Git.setRemoteBranch(workspace.uri, local)
				}
			}

		} catch (ex) {
			Util.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Syncing failed.`
		}

		vscode.window.setStatusBarMessage(`Syncing completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}