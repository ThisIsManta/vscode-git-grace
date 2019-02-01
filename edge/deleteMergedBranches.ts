import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { fetchInternal } from './fetch'
import Log from './Log'
import { track } from './Amplitude'

let syncingStatusBar: vscode.StatusBarItem

interface Branch {
	root: vscode.WorkspaceFolder
	name: string
}

export default async function (options: { token: vscode.CancellationToken }) {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	await fetchInternal(options.token)

	syncingStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10)
	syncingStatusBar.text = `$(clock) Querying merged branches...`
	syncingStatusBar.tooltip = 'Click to cancel the operation'
	syncingStatusBar.command = 'gitGrace.deleteMergedBranches.cancel'
	syncingStatusBar.show()

	const mergedLocalBranches: Array<Branch> = []
	const mergedRemoteBranches: Array<Branch> = []

	for (const workspace of workspaceList) {
		mergedLocalBranches.push(...(await getMergedBranchNames(workspace.uri, false)).map(name => ({ root: workspace, name })))
		mergedRemoteBranches.push(...(await getMergedBranchNames(workspace.uri, true)).map(name => ({ root: workspace, name })))
	}

	if (options.token.isCancellationRequested) {
		cancelMergedBranchDeletion()
		return null
	}

	if (mergedLocalBranches.length + mergedRemoteBranches.length === 0) {
		vscode.window.showInformationMessage(`There were no merged branches to be deleted.`)

		cancelMergedBranchDeletion()
		return null
	}

	const branchNameList = [
		[mergedLocalBranches, 'local branch'],
		[mergedRemoteBranches, 'remote branch']
	]
		.filter(([list, unit]) => list.length > 0)
		.map(([list, unit]) => list.length + ' ' + unit + (list.length > 1 ? 'es' : ''))
		.join(' and ')
	const select = await vscode.window.showInformationMessage(
		`Are you sure you want to delete ${branchNameList}?`,
		{ modal: true }, 'Delete Merged Branches')
	if (!select) {
		cancelMergedBranchDeletion()
		return null
	}

	// Remove the merged local branches quickly
	for (const branch of mergedLocalBranches) {
		if (options.token.isCancellationRequested) {
			cancelMergedBranchDeletion()
			return null
		}

		await Git.run(branch.root.uri, 'branch', '--delete', '--force', branch.name, { retry: 1, token: options.token })
	}

	if (mergedRemoteBranches.length === 0) {
		vscode.window.showInformationMessage(`${mergedLocalBranches.length} merged local branch${mergedLocalBranches.length > 1 ? 'es have' : ' has'} been deleted.`)

		cancelMergedBranchDeletion()
		return null
	}

	// Remove the merged remote branches with the progress bar
	let deletedRemoteBranchCount = 1
	try {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, async () => {
			for (const branch of mergedRemoteBranches) {
				syncingStatusBar.text = `$(clock) Deleting merged remote branches... (${deletedRemoteBranchCount} of ${mergedRemoteBranches.length})`
				const branchNameWithoutOrigin = branch.name.substring(branch.name.indexOf('/') + 1)
				try {
					await Git.run(branch.root.uri, 'push', '--delete', 'origin', branchNameWithoutOrigin, { retry: 1, token: options.token })
				} catch (ex) {
					Util.setWorkspaceAsFirstTryNextTime(branch.root)

					if (typeof ex !== 'string' || ex.includes(`error: unable to delete '${branchNameWithoutOrigin}': remote ref does not exist`) === false) {
						throw ex
					}
				}
				deletedRemoteBranchCount += 1

				if (options.token.isCancellationRequested) {
					cancelMergedBranchDeletion()
					return null
				}
			}
		})
		deletedRemoteBranchCount -= 1 // Compensate the initial count of 1

		if (options.token.isCancellationRequested) {
			cancelMergedBranchDeletion()
			return null
		}

		vscode.window.showInformationMessage(`${mergedLocalBranches.length + mergedRemoteBranches.length} merged branch${mergedLocalBranches.length + mergedRemoteBranches.length ? 'es have' : 'has'} been deleted.`)

	} catch (ex) {
		if (ex instanceof Error) {
			Log.appendLine(ex.message)
		}

		track('delete-merged-branches', { success: false })

		throw `Deleting merged branches failed - only ${deletedRemoteBranchCount === 1 ? `branch "${mergedRemoteBranches[0].name}" has` : `${deletedRemoteBranchCount} branches have`} been deleted.`
	}

	track('delete-merged-branches', { success: true })

	cancelMergedBranchDeletion()
}

export async function getMergedBranchNames(link: vscode.Uri, remote: boolean) {
	const content = await Git.run(link, 'branch', '--merged', 'origin/master', remote ? '--remotes' : null)
	return _.chain(content.trim().split('\n'))
		.map(line => line.trim().split(' -> '))
		.flatten()
		.without('origin/HEAD', 'origin/master')
		.reject(name => name.startsWith('*'))
		.compact()
		.value()
}

function cancelMergedBranchDeletion() {
	if (syncingStatusBar) {
		syncingStatusBar.hide()
		syncingStatusBar.dispose()
		syncingStatusBar = undefined
	}
}
