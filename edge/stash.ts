import compact from 'lodash/compact'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { track } from './Telemetry'

export default async function stash() {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	track('stash')

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Saving Stash...' }, async () => {
		try {
			await Git.run(workspace.uri, 'stash', 'save', '--include-untracked')

		} catch (ex) {
			Util.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Saving stash failed.`
		}
	})

	vscode.commands.executeCommand('git.refresh')

	updateStashCountBar()
}

export async function stashPopLatest() {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Popping Stash...' }, async () => {
		try {
			await Git.run(workspace.uri, 'stash', 'pop')

			track('stash-pop-latest', { success: true })

		} catch (ex) {
			track('stash-pop-latest', { success: false })

			Util.setWorkspaceAsFirstTryNextTime(workspace)

			throw `Popping stash failed.`
		}
	})

	vscode.commands.executeCommand('git.refresh')

	updateStashCountBar()
}

export async function stashPop() {
	track('stash-pop')

	await vscode.commands.executeCommand('git.stashPop')

	updateStashCountBar()
}

export async function stashClear() {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	track('stash-clear')

	await Git.run(workspace.uri, 'stash', 'clear')

	updateStashCountBar()
}

let stashCountBar: vscode.StatusBarItem

export async function updateStashCountBar() {
	const workspace = await Util.getCurrentWorkspace()
	if (workspace) {
		const result = await Git.run(workspace.uri, 'stash', 'list')
		const stashList = compact(result.split('\n'))
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
