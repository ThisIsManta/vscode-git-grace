import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { fetchInternal } from './fetch'
import Log from './Log'
import { track } from './Amplitude'

interface Branch {
	root: vscode.WorkspaceFolder
	name: string
}

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Deleting merged branches...', cancellable: true }, async (progress, token) => {
		await fetchInternal()

		const mergedLocalBranches: Array<Branch> = []
		const mergedRemoteBranches: Array<Branch> = []

		for (const workspace of workspaceList) {
			mergedLocalBranches.push(...(await getMergedBranchNames(workspace.uri, false)).map(name => ({ root: workspace, name })))
			mergedRemoteBranches.push(...(await getMergedBranchNames(workspace.uri, true)).map(name => ({ root: workspace, name })))
		}

		if (token.isCancellationRequested) {
			throw null
		}

		if (mergedLocalBranches.length + mergedRemoteBranches.length === 0) {
			vscode.window.showInformationMessage(`There were no merged branches to be deleted.`)

			throw null
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
			throw null
		}

		// Remove the merged local branches quickly
		for (const branch of mergedLocalBranches) {
			if (token.isCancellationRequested) {
				throw null
			}

			await Git.run(branch.root.uri, 'branch', '--delete', '--force', branch.name, { retry: 1, token })
		}

		if (mergedRemoteBranches.length === 0) {
			vscode.window.showInformationMessage(`${mergedLocalBranches.length} merged local branch${mergedLocalBranches.length > 1 ? 'es have' : ' has'} been deleted.`)

			throw null
		}

		// Remove the merged remote branches with the progress bar
		let deletedRemoteBranchCount = 1
		const increment = 100 / mergedRemoteBranches.length
		try {
			for (const branch of mergedRemoteBranches) {
				progress.report({ increment })

				const branchNameWithoutOrigin = branch.name.substring(branch.name.indexOf('/') + 1)
				try {
					await Git.run(branch.root.uri, 'push', '--delete', 'origin', branchNameWithoutOrigin, { retry: 1, token })
				} catch (ex) {
					Util.setWorkspaceAsFirstTryNextTime(branch.root)

					if (typeof ex !== 'string' || ex.includes(`error: unable to delete '${branchNameWithoutOrigin}': remote ref does not exist`) === false) {
						throw ex
					}
				}
				deletedRemoteBranchCount += 1

				if (token.isCancellationRequested) {
					throw null
				}
			}
			deletedRemoteBranchCount -= 1 // Compensate the initial count of 1

			if (token.isCancellationRequested) {
				throw null
			}

			track('delete-merged-branches', { success: true })

			_.defer(() => {
				vscode.window.showInformationMessage(`${mergedLocalBranches.length + mergedRemoteBranches.length} merged branch${mergedLocalBranches.length + mergedRemoteBranches.length ? 'es have' : 'has'} been deleted.`)
			})

		} catch (ex) {
			if (ex instanceof Error) {
				Log.appendLine(ex.message)
			}

			track('delete-merged-branches', { success: false })

			throw `Deleting merged branches failed - only ${deletedRemoteBranchCount === 1 ? `branch "${mergedRemoteBranches[0].name}" has` : `${deletedRemoteBranchCount} branches have`} been deleted.`
		}
	})
}

export async function getMergedBranchNames(link: vscode.Uri, remote: boolean) {
	const content = await Git.run(link, 'branch', '--merged', 'origin/master', remote ? '--remotes' : null)
	return _.chain(content.trim().split('\n'))
		.map(line => line.trim().split(' -> '))
		.flatten()
		.without('origin/HEAD', 'origin/master', 'origin/dev')
		.reject(name => name.startsWith('*'))
		.compact()
		.value()
}
