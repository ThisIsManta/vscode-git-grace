import without from 'lodash/without'
import * as vscode from 'vscode'

import * as Util from './Utility'
import * as Git from './Git'
import { fetchInternal, trySyncRemoteBranch } from './fetch'
import stash from './stash'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty && await tryAbortBecauseOfDirtyFiles(workspace.uri)) {
		return null
	}

	if (status.local === '' && await tryAbortBecauseOfDanglingCommits(workspace.uri, 'another branch')) {
		return null
	}

	let localBranches: string[] = []
	let remoteBranches: string[] = []
	async function setPickerItems() {
		const branches = await Promise.all([
			Git.getLocalBranchNames(workspace.uri),
			Git.getRemoteBranchNames(workspace.uri),
		])
		localBranches = branches[0]
		remoteBranches = without(branches[1], 'origin/HEAD')

		picker.items = [...localBranches, ...remoteBranches].map(name => ({ label: name }))
		if (status.local) {
			picker.activeItems = [picker.items.find(item => item.label === status.local)]
		}
	}

	const picker = vscode.window.createQuickPick()
	picker.placeholder = 'Select a branch to checkout'
	await setPickerItems()
	picker.busy = true
	picker.show()

	// Do lazy fetching
	const syncBranchNamePromise = fetchInternal().then(async updated => {
		if (updated) {
			await setPickerItems()
		}
		picker.busy = false
	})

	return new Promise<void>((resolve, reject) => {
		picker.onDidAccept(async () => {
			const selectBranchName = picker.selectedItems[0]?.label ?? picker.value

			picker.hide()
			picker.dispose()

			if (!selectBranchName) {
				resolve()
				return
			}

			try {
				await syncBranchNamePromise

				if (remoteBranches.includes(selectBranchName)) {
					const remoteBranchName = selectBranchName
					const localBranchName = remoteBranchName.replace(/^origin\//, '')

					if (localBranches.includes(localBranchName)) {
						const groups = await Git.getBranchTopology(workspace.uri, localBranchName, remoteBranchName)
						if (groups.length === 1 && groups[0][0].direction === '>') {
							// Fast forward
							await checkoutInternal(workspace.uri, localBranchName, remoteBranchName)
							resolve()
							return
						}

						await checkoutInternal(workspace.uri, localBranchName)
						resolve()
						return
					}

					await checkoutInternal(workspace.uri, localBranchName, remoteBranchName)
					resolve()
					return
				}

				await checkoutInternal(workspace.uri, selectBranchName)
				resolve()

			} catch (ex) {
				reject(ex)
			}
		})

		picker.onDidHide(() => {
			resolve()
		})
	}).then(async () => {
		await vscode.commands.executeCommand('git.refresh')

		await trySyncRemoteBranch(workspace)
	})
}

async function checkoutInternal(link: vscode.Uri, localBranchName: string, remoteBranchName?: string) {
	let output: string
	if (remoteBranchName) {
		output = await Git.run(link, 'checkout', '-B', localBranchName, '--track', remoteBranchName)

	} else {
		// Note that this is a short hard to `git checkout -b <branch> --track origin/<branch>`
		output = await Git.run(link, 'checkout', localBranchName)
	}

	if (output.startsWith('error:')) {
		throw new Error(output.trim())
	}
}

export async function tryAbortBecauseOfDirtyFiles(link: vscode.Uri) {
	const select = await vscode.window.showWarningMessage(
		`The current repository is dirty.`,
		{ modal: true }, 'Stash Now', 'Discard All Files')
	if (!select) {
		return true
	}

	if (select === 'Stash Now') {
		const error = await stash()
		if (error !== undefined) {
			return true
		}

	} else if (select === 'Discard All Files') {
		try {
			await Git.run(link, 'reset', '--hard')

		} catch (ex) {
			throw `Cleaning up files failed.`
		}
	}

	return false
}

export async function tryAbortBecauseOfDanglingCommits(link: vscode.Uri, branchName: string) {
	const commitHash = await Git.getCurrentCommitHash(link)

	const containingLocalBranches = await Git.run(link, 'branch', '--contains', commitHash)
	if (/^\*\s/.test(containingLocalBranches.trim()) === false) {
		return false
	}

	const containingRemoteBranches = await Git.run(link, 'branch', '--remote', '--contains', commitHash)
	if (containingRemoteBranches.trim().length > 0) {
		return false
	}

	const select = await vscode.window.showWarningMessage(
		`Checking out ${branchName} will make you lose the changes made on this detached head.`,
		{ modal: true }, 'Discard Dangling Commits')
	if (!select) {
		return true
	}

	return false
}
