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
	if (status.dirty && await tryCleanUpRepository(workspace.uri) !== true) {
		return null
	}

	const picker = vscode.window.createQuickPick()
	picker.placeholder = 'Select a branch to checkout'
	await setPickerItems(picker, workspace.uri, status.local)
	picker.show()

	let pickerIsClosed = false

	// Do lazy fetching
	fetchInternal().then(async (updated: boolean) => {
		if (pickerIsClosed || !updated) {
			return null
		}

		await setPickerItems(picker, workspace.uri, status.local)
	})

	return new Promise(resolve => {
		picker.onDidAccept(async () => {
			pickerIsClosed = true

			const [select] = picker.selectedItems
			picker.hide()
			picker.dispose()

			try {
				await Git.run(workspace.uri, 'checkout', '-B', select.label.replace(/^origin\//, ''), '--track', select.label)
			} catch (ex) {
				throw `Checking out "${select.label}" failed`
			}

			await vscode.commands.executeCommand('git.refresh')

			// Do not wait for the optional operation
			trySyncRemoteBranch(workspace)

			resolve()
		})

		picker.onDidHide(() => {
			resolve()
		})
	})
}

async function setPickerItems(picker: vscode.QuickPick<vscode.QuickPickItem>, link: vscode.Uri, currentLocalBranch: string) {
	const localBranches = await Git.getLocalBranchNames(link)
	const remoteBranches = await Git.getRemoteBranchNames(link)

	picker.items = [...localBranches, ...remoteBranches].map(name => ({ label: name }))
	if (currentLocalBranch) {
		picker.activeItems = [picker.items.find(item => item.label === currentLocalBranch)]
	}
}

export async function tryCleanUpRepository(link: vscode.Uri) {
	const select = await vscode.window.showWarningMessage(
		`The current repository is dirty.`,
		{ modal: true }, 'Stash Now', 'Discard All Files')
	if (!select) {
		return null
	}

	if (select === 'Stash Now') {
		const error = await stash()
		if (error !== undefined) {
			return null
		}

	} else if (select === 'Discard All Files') {
		try {
			await Git.run(link, 'reset', '--hard')

		} catch (ex) {
			throw `Cleaning up files failed.`
		}
	}

	return true
}
