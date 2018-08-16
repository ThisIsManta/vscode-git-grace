import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { fetchInternal } from './fetch'
import Log from './Log'

let syncingStatusBar: vscode.StatusBarItem

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	if (syncingStatusBar !== undefined) {
		return undefined
	}

	await fetchInternal()

	syncingStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10)
	syncingStatusBar.text = `$(clock) Querying merged branches...`
	syncingStatusBar.tooltip = 'Click to cancel the operation'
	syncingStatusBar.command = 'gitGrace.deleteMergedBranches.cancel'
	syncingStatusBar.show()

	interface Branch {
		root: vscode.WorkspaceFolder
		name: string
	}

	let mergedLocalBranches: Array<Branch> = []
	let mergedRemoteBranches: Array<Branch> = []

	async function getMergedBranchNames(root: vscode.WorkspaceFolder, remote: boolean) {
		const content = await Git.run(root.uri, 'branch', '--merged', 'origin/master', remote ? '--remotes' : null)
		return _.chain(content.trim().split('\n'))
			.map(line => line.trim().split(' -> '))
			.flatten()
			.difference(['origin/HEAD', 'origin/master'])
			.reject(name => name.startsWith('*'))
			.compact()
			.map(name => ({ root, name }))
			.value()
	}

	for (const workspace of workspaceList) {
		mergedLocalBranches = mergedLocalBranches.concat(await getMergedBranchNames(workspace, false))
		mergedRemoteBranches = mergedRemoteBranches.concat(await getMergedBranchNames(workspace, true))
	}

	if (mergedLocalBranches.length === 0 && mergedRemoteBranches.length === 0) {
		vscode.window.showInformationMessage(`There were no merged branches to be deleted.`)

		cancelMergedBranchDeletion()
		return undefined
	}

	const select = await vscode.window.showInformationMessage(
		`Are you sure you want to delete ${[[mergedLocalBranches, 'local branch'], [mergedRemoteBranches, 'remote branch']].filter(([list, unit]) => list.length > 0).map(([list, unit]) => list.length + ' ' + unit + (list.length > 1 ? 'es' : '')).join(' and ')}?`,
		{ modal: true }, 'Delete Merged Branches')
	if (!select) {
		cancelMergedBranchDeletion()
		return undefined
	}

	// Remove the merged local branches quickly
	for (const branch of mergedLocalBranches) {
		await Git.run(branch.root.uri, 'branch', '--delete', '--force', branch.name, { retry: 1 })
	}

	if (mergedRemoteBranches.length === 0) {
		vscode.window.showInformationMessage(`${mergedLocalBranches.length} merged local branch${mergedLocalBranches.length > 1 ? 'es have' : ' has'} been deleted.`)

		cancelMergedBranchDeletion()
		return undefined
	}

	// Remove the merged remote branches with the progress bar
	let deletedRemoteBranchCount = 1
	try {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl }, async () => {
			for (const branch of mergedRemoteBranches) {
				syncingStatusBar.text = `$(clock) Deleting merged remote branches... (${deletedRemoteBranchCount} of ${mergedRemoteBranches.length})`
				const branchNameWithoutOrigin = branch.name.substring(branch.name.indexOf('/') + 1)
				try {
					await Git.run(branch.root.uri, 'push', '--delete', 'origin', branchNameWithoutOrigin, { retry: 1 })
				} catch (ex) {
					Util.setWorkspaceAsFirstTryNextTime(branch.root)

					if (typeof ex !== 'string' || ex.includes(`error: unable to delete '${branchNameWithoutOrigin}': remote ref does not exist`) === false) {
						throw ex
					}
				}
				deletedRemoteBranchCount += 1
			}
		})
		deletedRemoteBranchCount -= 1 // Compensate the initial count of 1

		vscode.window.showInformationMessage(`${mergedLocalBranches.length + mergedRemoteBranches.length} merged branch${mergedLocalBranches.length + mergedRemoteBranches.length ? 'es have' : 'has'} been deleted.`)

	} catch (ex) {
		if (ex instanceof Error) {
			Log.appendLine(ex.message)
		}

		throw `Deleting merged branches failed - only ${deletedRemoteBranchCount === 1 ? `branch "${mergedRemoteBranches[0].name}" has` : `${deletedRemoteBranchCount} branches have`} been deleted.`
	}

	cancelMergedBranchDeletion()
}

export function cancelMergedBranchDeletion() {
	if (syncingStatusBar) {
		syncingStatusBar.hide()
		syncingStatusBar.dispose()
		syncingStatusBar = undefined
	}
}