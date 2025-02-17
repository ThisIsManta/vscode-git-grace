import * as vscode from 'vscode'

import { getMergedBranchNames } from './deleteMergedBranches'
import * as Git from './Git'
import Telemetry from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const errorCount = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		title: 'Syncing...',
		cancellable: true,
	}, async (progress, token) => {
		const workspaceList = Util.getWorkspaceListWithGitEnabled()
		if (workspaceList.length === 0) {
			return null
		}

		await Util.saveAllFilesOnlyIfAutoSaveIsOn()

		await vscode.commands.executeCommand('git.refresh')

		for (const workspace of workspaceList) {
			if (token.isCancellationRequested) {
				return null
			}

			const status = await Git.getCurrentBranchStatus(workspace.uri)
			if (status.dirty) {
				await vscode.commands.executeCommand('git.commit')

				const statusAfterCommitCommand = await Git.getCurrentBranchStatus(workspace.uri)
				if (statusAfterCommitCommand.dirty) {
					return null
				}
			}
		}

		const automatedWorkers: Array<{
			workspace: vscode.WorkspaceFolder
			action: () => Promise<any>
		}> = []
		const interactiveWorkers: Array<{
			workspace: vscode.WorkspaceFolder
			action: () => any
		}> = []

		for (const workspace of workspaceList) {
			if (token.isCancellationRequested) {
				return null
			}

			try {
				await Git.run(workspace.uri, 'fetch', '--prune', 'origin', { retry: 2 })

				const counterparts = await Git.getBranchCounterparts(workspace.uri)
				const remoteBranchNames = new Set((await Git.getRemoteBranches(workspace.uri)).map(branch => branch.name))
				const mergedBranchNames = new Set(await getMergedBranchNames(workspace.uri, false))

				automatedWorkers.push({
					workspace,
					action: () => Git.run(workspace.uri, 'push', '--tags', { retry: 1 }),
				})

				for (const { local, remote } of counterparts) {
					if (remote && remoteBranchNames.has(remote)) {
						const groups = await Git.getBranchTopology(workspace.uri, local, remote)
						if (groups.length === 0) {
							continue

						} else if (groups.length === 1) {
							if (groups[0][0].direction === '<') {
								automatedWorkers.push({
									workspace,
									action: () => Git.run(workspace.uri, 'push', 'origin', local, { retry: 1 }),
								})

							} else {
								automatedWorkers.push({
									workspace,
									action: () => Git.run(workspace.uri, 'rebase', '--no-stat'),
								})
							}

						} else {
							interactiveWorkers.push({
								workspace,
								action: () => vscode.window.showErrorMessage(`The local branch "${local}" is out of sync with its remote branch.`),
							})
						}

					} else if (mergedBranchNames.has(local)) {
						automatedWorkers.push({
							workspace,
							action: () => Git.run(workspace.uri, 'branch', '--delete', '--force', local, { retry: 1 }),
						})

					} else {
						automatedWorkers.push({
							workspace,
							action: async () => {
								await Git.run(workspace.uri, 'push', 'origin', local, { retry: 1 })
								await Git.setRemoteBranch(workspace.uri, local)
							},
						})
					}
				}

			} catch (error) {
				Util.setWorkspaceAsFirstTryNextTime(workspace)

				throw new Error('Syncing failed.')
			}
		}

		const increment = 100 / automatedWorkers.length
		let errorCount = 0
		for (const worker of automatedWorkers) {
			if (token.isCancellationRequested) {
				return null
			}

			progress.report({ increment })

			try {
				await worker.action()

			} catch (error) {
				errorCount += 1

				vscode.window.showErrorMessage((workspaceList.length > 1 ? `${worker.workspace.name}: ` : '') + error)

				Util.setWorkspaceAsFirstTryNextTime(worker.workspace)
			}
		}

		await vscode.commands.executeCommand('git.refresh')

		if (token.isCancellationRequested) {
			return null
		}

		for (const worker of interactiveWorkers) {
			worker.action()
		}

		return errorCount
	})

	Telemetry.logUsage('sync')

	if (typeof errorCount === 'number') {
		vscode.window.setStatusBarMessage(
			'Syncing completed' + (errorCount === 0 ? '' : ` with ${errorCount} failure${errorCount === 1 ? '' : 's'}`),
			10000,
		)
	}
}
