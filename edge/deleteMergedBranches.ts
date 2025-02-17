import compact from 'lodash/compact'
import defer from 'lodash/defer'
import without from 'lodash/without'
import * as vscode from 'vscode'

import { fetchInternal } from './fetch'
import * as Git from './Git'
import Log from './Log'
import Telemetry from './Telemetry'
import * as Util from './Utility'

interface Branch {
	root: vscode.WorkspaceFolder
	name: string
}

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return
	}

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: 'Deleting merged branches...',
		cancellable: true,
	}, async (progress, token) => {
		await fetchInternal()

		const mergedLocalBranches: Array<Branch> = []
		const mergedRemoteBranches: Array<Branch> = []
		for (const workspace of workspaceList) {
			mergedLocalBranches.push(...(await getMergedBranchNames(workspace.uri, false)).map(name => ({
				root: workspace,
				name,
			})))
			mergedRemoteBranches.push(...(await getMergedBranchNames(workspace.uri, true)).map(name => ({
				root: workspace,
				name,
			})))
		}

		if (token.isCancellationRequested) {
			throw new vscode.CancellationError()
		}

		if (mergedLocalBranches.length + mergedRemoteBranches.length === 0) {
			vscode.window.showInformationMessage('There were no merged branches to be deleted.')

			throw new vscode.CancellationError()
		}

		const branchNameList = [
			[mergedLocalBranches, 'local branch'],
			[mergedRemoteBranches, 'remote branch'],
		]
			.filter(([list, unit]) => list.length > 0)
			.map(([list, unit]) => list.length + ' ' + unit + (list.length > 1 ? 'es' : ''))
			.join(' and ')
		const select = await vscode.window.showInformationMessage(
			'Would you like to delete the following branches?',
			{
				modal: true,
				detail: branchNameList,
			},
			'Delete Merged Branches',
		)

		if (!select) {
			throw new vscode.CancellationError()
		}

		// Remove the merged local branches quickly
		for (const branch of mergedLocalBranches) {
			if (token.isCancellationRequested) {
				throw new vscode.CancellationError()
			}

			await Git.run(branch.root.uri, 'branch', '--delete', '--force', branch.name, {
				retry: 1,
				token,
			})
		}

		if (mergedRemoteBranches.length === 0) {
			vscode.window.showInformationMessage(`${mergedLocalBranches.length} merged local branch${mergedLocalBranches.length > 1 ? 'es have' : ' has'} been deleted.`)

			throw new vscode.CancellationError()
		}

		// Remove the merged remote branches with the progress bar
		let deletedRemoteBranchCount = 1
		const increment = 100 / mergedRemoteBranches.length

		try {
			for (const branch of mergedRemoteBranches) {
				progress.report({ increment })

				const branchNameWithoutOrigin = branch.name.substring(branch.name.indexOf('/') + 1)

				try {
					await Git.run(branch.root.uri, 'push', '--delete', 'origin', branchNameWithoutOrigin, {
						retry: 1,
						token,
					})

				} catch (error) {
					Util.setWorkspaceAsFirstTryNextTime(branch.root)

					if (!(error instanceof Git.GitCommandLineError) || !error.message.includes(`error: unable to delete '${branchNameWithoutOrigin}': remote ref does not exist`)) {
						throw error
					}
				}

				deletedRemoteBranchCount += 1

				if (token.isCancellationRequested) {
					throw new vscode.CancellationError()
				}
			}

			// Compensate the initial count of 1
			deletedRemoteBranchCount -= 1

			if (token.isCancellationRequested) {
				throw new vscode.CancellationError()
			}

			Telemetry.logUsage('delete-merged-branches')

			defer(() => {
				vscode.window.showInformationMessage(`${mergedLocalBranches.length + mergedRemoteBranches.length} merged branch${mergedLocalBranches.length + mergedRemoteBranches.length ? 'es have' : 'has'} been deleted.`)
			})

		} catch (error) {
			if (error instanceof vscode.CancellationError) {
				return
			}

			if (error instanceof Error) {
				Log.appendLine(error.message)

				Telemetry.logError(error)
			}

			throw new Error(`Deleting merged branches failed - only ${deletedRemoteBranchCount === 1 ? `branch "${mergedRemoteBranches[0].name}" has` : `${deletedRemoteBranchCount} branches have`} been deleted.`)
		}
	})
}

export async function getMergedBranchNames(link: vscode.Uri, remote: boolean) {
	const headBranchName = await Git.getRemoteHeadBranchName(link)
	const content = await Git.run(link, 'branch', '--merged', 'origin/' + headBranchName, remote ? '--remotes' : '')
	return compact(without(
		content.trim()
			.split('\n')
			.flatMap(line => line.trim().split(' -> ')),
		'origin/HEAD',
		'origin/' + headBranchName,
	).filter(name => !name.startsWith('*')))
}
