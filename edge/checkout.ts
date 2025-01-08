import compact from 'lodash/compact'
import sortBy from 'lodash/sortBy'
import * as vscode from 'vscode'

import { fetchInternal, trySyncRemoteBranch } from './fetch'
import * as Git from './Git'
import stash from './stash'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const workspaceLink = workspace.uri

	const status = await Git.getCurrentBranchStatus(workspaceLink)
	if (status.dirty && await tryAbortBecauseOfDirtyFiles(workspaceLink)) {
		return
	}

	if (status.local === '' && await tryAbortBecauseOfDanglingCommits(workspaceLink, 'another branch')) {
		return
	}

	async function getBranches() {
		const [localBranches, remoteBranches] = await Promise.all([
			Git.getLocalBranches(workspaceLink),
			Git.getRemoteBranches(workspaceLink),
			// TODO: include tags
		])

		return {
			localBranches,
			remoteBranches,
		}
	}

	function getPickerItems({ localBranches, remoteBranches }: {
		localBranches: Array<{
			commitHash: string
			name: string
			upstreamName?: string
			date: Date
		}>
		remoteBranches: Array<{
			commitHash: string
			name: string
			date: Date
		}>
	}): Array<vscode.QuickPickItem> {
		const remoteBranchIcon = new vscode.ThemeIcon('cloud')

		const remoteBranchToCommitHash = new Map(remoteBranches.map(branch => [branch.name, branch.commitHash]))

		return [
			...sortBy(localBranches, branch => -branch.date.valueOf())
				.filter(branch => {
					if (!branch.upstreamName) {
						return true
					}

					// Reduce noise by hiding local branches that point to the same commit as its upstream
					if (branch.upstreamName === ('origin/' + branch.name) && remoteBranchToCommitHash.get(branch.upstreamName) === branch.commitHash) {
						return false
					}

					return true
				})
				.map(branch => ({
					label: branch.name,
					// Show upstream branch name if it is not conventional
					detail: (branch.upstreamName && branch.upstreamName !== ('origin/' + branch.name)) ? ('$(' + remoteBranchIcon.id + ') ' + branch.upstreamName) : undefined,
				})),
			{
				label: 'Remote',
				kind: vscode.QuickPickItemKind.Separator,
			},
			...remoteBranches
				.map(branch => ({
					iconPath: remoteBranchIcon,
					label: branch.name,
				})),
		]
	}

	function getSelectPickerItem(items: ReadonlyArray<vscode.QuickPickItem>) {
		return compact([items.find(item => item.label === status.local)])
	}

	let branches = await getBranches()

	const picker = vscode.window.createQuickPick()
	picker.placeholder = 'Select a branch to checkout or enter a commit hash'
	picker.items = getPickerItems(branches)
	picker.activeItems = getSelectPickerItem(picker.items)
	picker.matchOnDetail = true
	picker.busy = true
	picker.show()

	// Do lazy fetching
	const fetchPromise = fetchInternal().then(async updated => {
		if (updated) {
			branches = await getBranches()
			picker.items = getPickerItems(branches)
			picker.activeItems = getSelectPickerItem(picker.items)
		}

		picker.busy = false
	})

	await new Promise<void>((resolve, reject) => {
		picker.onDidHide(() => {
			resolve()
		})

		picker.onDidAccept(async () => {
			const input = picker.selectedItems[0]?.label ?? picker.value

			picker.hide()
			picker.dispose()

			if (!input) {
				resolve()

				return
			}

			try {
				await fetchPromise

				const { localBranches, remoteBranches } = branches
				const selectRemoteBranch = remoteBranches.find(branch => branch.name.localeCompare(input, undefined, { sensitivity: 'base' }) === 0)
				if (selectRemoteBranch) {
					const branchName = selectRemoteBranch.name.replace(/^origin\//, '')
					if (localBranches.some(branch => branch.name.localeCompare(branchName, undefined, { sensitivity: 'base' }) === 0)) {
						const groups = await Git.getBranchTopology(workspaceLink, branchName, selectRemoteBranch.name)
						if (groups.length === 1 && groups[0][0].direction === '>') {
							// Fast forward
							await checkoutInternal(workspaceLink, branchName, selectRemoteBranch.name)
							resolve()

							return
						}

						await checkoutInternal(workspaceLink, branchName)
						trySyncRemoteBranch(workspace)
						resolve()

						return
					}

					await checkoutInternal(workspaceLink, branchName, selectRemoteBranch.name)
					resolve()

					return
				}

				await checkoutInternal(workspaceLink, input)
				resolve()

			} catch (error) {
				reject(error)
			}
		})
	})
}

async function checkoutInternal(link: vscode.Uri, localBranchName: string, remoteBranchName?: string) {
	let output: string
	if (remoteBranchName) {
		output = await Git.run(link, 'checkout', '-B', localBranchName, '--track', remoteBranchName)

	} else {
		// Note that this is a short hand to `git checkout -b <branch> --track origin/<branch>`
		// Note that the input can be a commit hash, which git-checkout will proceed in detached mode
		// See https://git-scm.com/docs/git-checkout#Documentation/git-checkout.txt---detach
		output = await Git.run(link, 'checkout', localBranchName)
	}

	if (output.startsWith('error:')) {
		throw new Error(output.trim())
	}

	await vscode.commands.executeCommand('git.refresh')
}

export async function tryAbortBecauseOfDirtyFiles(link: vscode.Uri): Promise<boolean> {
	const select = await vscode.window.showWarningMessage(
		'There are some uncommitted files.',
		{ modal: true },
		'Stash Now',
		'Discard All Files',
	)

	if (!select) {
		return true
	}

	if (select === 'Stash Now') {
		await stash()

	} else if (select === 'Discard All Files') {
		try {
			await Git.run(link, 'reset', '--hard')

		} catch (error) {
			throw new Error('Cleaning up files failed.')
		}
	}

	return false
}

export async function tryAbortBecauseOfDanglingCommits(link: vscode.Uri, branchName: string): Promise<boolean> {
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
		{ modal: true },
		'Discard Dangling Commits',
	)

	if (!select) {
		return true
	}

	return false
}
