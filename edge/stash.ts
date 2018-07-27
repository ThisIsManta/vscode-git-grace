import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'
import * as Git from './Git'

export default async function stash() {
	const workspace = await Shared.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Saving Stash...' }, async () => {
		try {
			await Git.run(workspace.uri, 'stash', 'save', '--include-untracked')

		} catch (ex) {
			Shared.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Saving stash failed.`
		}
	})

	vscode.commands.executeCommand('git.refresh')

	updateStashCountBar()
}

export async function stashPopLatest() {
	const workspace = await Shared.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Shared.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Popping Stash...' }, async () => {
		try {
			await Git.run(workspace.uri, 'stash', 'pop')

		} catch (ex) {
			Shared.setWorkspaceAsFirstTryNextTime(workspace)

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
	const workspace = await Shared.getCurrentWorkspace()
	if (workspace) {
		const result = await Git.run(workspace.uri, 'stash', 'list')
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
