import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function stash() {
	const root = await Shared.getCurrentRoot()
	if (!root) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Saving Stash...' }, async () => {
		try {
			await Shared.git(root.uri, 'stash', 'save', '--include-untracked')

		} catch (ex) {
			Shared.setRootAsFailure(root)

			throw `Saving stash failed.`
		}
	})

	vscode.commands.executeCommand('git.refresh')

	updateStashCountBar()
}

export async function stashPopLatest() {
	const root = await Shared.getCurrentRoot()
	if (!root) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Popping Stash...' }, async () => {
		try {
			await Shared.git(root.uri, 'stash', 'pop')

		} catch (ex) {
			Shared.setRootAsFailure(root)

			throw `Popping stash failed.`
		}
	})

	vscode.commands.executeCommand('git.refresh')

	updateStashCountBar()
}

export async function stashPop() {
	await vscode.commands.executeCommand('git.stashPop')

	updateStashCountBar()
}

let stashCountBar: vscode.StatusBarItem

export async function updateStashCountBar() {
	const root = await Shared.getCurrentRoot()
	if (root) {
		const result = await Shared.git(root.uri, 'stash', 'list')
		const stashList = _.compact(result.split('\n'))
		if (stashList.length > 0) {
			if (!stashCountBar) {
				stashCountBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5)
			}
			stashCountBar.text = `${stashList.length} Stash${stashList.length > 1 ? 'es' : ''}`
			stashCountBar.command = 'gitGrace.stashPop'
			stashCountBar.show()
			return undefined
		}
	}

	if (stashCountBar) {
		stashCountBar.dispose()
		stashCountBar = null
	}
}
