import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
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

	let localBranches: string[]
	let remoteBranches: string[]
	async function setPickerItems() {
		localBranches = await Git.getLocalBranchNames(workspace.uri)
		remoteBranches = await Git.getRemoteBranchNames(workspace.uri)

		picker.items = [...localBranches, ...remoteBranches].map(name => ({ label: name }))
		if (status.local) {
			picker.activeItems = [picker.items.find(item => item.label === status.local)]
		}
	}

	const picker = vscode.window.createQuickPick()
	picker.placeholder = 'Select a branch to checkout'
	await setPickerItems()
	picker.show()

	// Do lazy fetching
	const fetchPromise = fetchInternal().then(async updated => {
		if (updated) {
			await setPickerItems()
		}
	})

	return new Promise(resolve => {
		picker.onDidAccept(async () => {
			const [select] = picker.selectedItems
			picker.hide()
			picker.dispose()

			if (localBranches.indexOf(select.label) >= 0) {
				track('checkout:local')

				await checkoutInternal(workspace.uri, select.label)

			} else if (remoteBranches.indexOf(select.label) >= 0) {
				const remoteBranchName = select.label
				const localBranchName = remoteBranchName.replace(/^origin\//, '')

				if (localBranches.indexOf(localBranchName) >= 0) {
					const groups = await Git.getBranchTopology(workspace.uri, localBranchName, remoteBranchName)
					if (groups.length === 1 && groups[0][0].direction === '>') {
						track('checkout:remote', { safe: true })

						await checkoutInternal(workspace.uri, localBranchName, remoteBranchName)

					} else {
						track('checkout:remote', { safe: false })

						await checkoutInternal(workspace.uri, localBranchName)
					}

				} else {
					track('checkout:remote', { safe: true })

					await checkoutInternal(workspace.uri, localBranchName, remoteBranchName)
				}

			} else {
				resolve()
				return null
			}

			await vscode.commands.executeCommand('git.refresh')

			await fetchPromise
			await trySyncRemoteBranch(workspace)

			resolve()
		})

		picker.onDidHide(() => {
			resolve()
		})
	})
}

async function checkoutInternal(link: vscode.Uri, localBranchName: string, remoteBranchName?: string) {
	if (remoteBranchName) {
		await Git.run(link, 'checkout', '-B', localBranchName, '--track', remoteBranchName)

	} else {
		await Git.run(link, 'checkout', localBranchName)
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
	const commitHash = await Git.getCommitHash(link)

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
