import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { getMergedBranchNames } from './deleteMergedBranches'
import Log from './Log'

export default async function () {
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

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Syncing...' }, async () => {
		try {
			await Git.run(workspace.uri, 'fetch', '--prune', 'origin', { retry: 2 })

			const counterparts = _.sortBy(await Git.getBranchCounterparts(workspace.uri), ({ local }) => local === status.local ? 0 : 1)
			const remoteBranches = new Set(await Git.getRemoteBranchNames(workspace.uri))
			const mergedBranches = new Set(await getMergedBranchNames(workspace.uri, false))
			for (const { local, remote } of counterparts) {
				if (remoteBranches.has(remote)) {
					const groups = await Git.getBranchTopology(workspace.uri, local, remote)
					if (groups.length === 0) {
						continue

					} else if (groups.length === 1) {
						if (groups[0][0].direction === '<') {
							await Git.run(workspace.uri, 'push', 'origin', local, { retry: 1 })

						} else {
							await Git.run(workspace.uri, 'pull', '--ff-only', 'origin', local)
						}

					} else {
						await Git.run(workspace.uri, 'rebase', '--no-stat')
					}

				} else if (mergedBranches.has(local)) {
					await Git.run(workspace.uri, 'branch', '--delete', '--force', local, { retry: 1 })

				} else {
					await Git.run(workspace.uri, 'push', 'origin', local, { retry: 1 })
					await Git.setRemoteBranch(workspace.uri, local)
				}
			}

			await Git.run(workspace.uri, 'push', '--tags', { retry: 1 })

		} catch (ex) {
			Util.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Syncing failed.`
		}

		vscode.window.setStatusBarMessage(`Syncing completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}