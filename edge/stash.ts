import compact from 'lodash/compact'
import * as vscode from 'vscode'

import * as Git from './Git'
import Telemetry from './Telemetry'
import * as Util from './Utility'

export async function stashPush() {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await Promise.all([
		vscode.commands.executeCommand('workbench.view.scm'),
		vscode.commands.executeCommand('git.refresh'),
	])

	const stagedFilesOnly = await (async (): Promise<boolean | undefined> => {
		// Skip prompt if there are zero or only staged files
		if (
			!(
				// Staged files
				(await Git.run(workspace.uri, 'diff', '--name-only', '--cached'))
			) ||
			!(
				// Unstaged files
				(
					(await Git.run(workspace.uri, 'diff', '--name-only')) ||
					// Untracked files
					(await Git.run(
						workspace.uri,
						'ls-files',
						'--others',
						'--exclude-standard',
					))
				)
			)
		) {
			return undefined
		}

		const select = await vscode.window.showInformationMessage(
			'What files would you like to stash?',
			{ modal: true },
			'Staged Files Only',
			'All Files',
		)

		if (select === undefined) {
			throw new vscode.CancellationError()
		}

		return select === 'Staged Files Only'
	})()

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title: 'Pushing Stash...',
		},
		async () => {
			try {
				await Git.run(
					workspace.uri,
					'stash',
					'push',
					stagedFilesOnly ? '--staged' : '--include-untracked',
				)
			} catch (error) {
				Util.setWorkspaceAsFirstTryNextTime(workspace)

				throw new Error('Pushing stash failed.')
			}
		},
	)

	vscode.commands.executeCommand('git.refresh')

	Telemetry.logUsage('stash-push', { stagedFilesOnly })

	updateStashCountBar()
}

export async function stashPopLatest() {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title: 'Popping Stash...',
		},
		async () => {
			try {
				await Git.run(workspace.uri, 'stash', 'pop')

				Telemetry.logUsage('stash-pop-latest')
			} catch (error) {
				if (error instanceof Error) {
					Telemetry.logError(error)
				}

				Util.setWorkspaceAsFirstTryNextTime(workspace)

				throw new Error('Popping stash failed.')
			}
		},
	)

	vscode.commands.executeCommand('git.refresh')

	updateStashCountBar()
}

export async function stashPop() {
	await vscode.commands.executeCommand('git.stashPop')

	Telemetry.logUsage('stash-pop')

	updateStashCountBar()
}

export async function stashClear() {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	await Git.run(workspace.uri, 'stash', 'clear')

	Telemetry.logUsage('stash-clear')

	updateStashCountBar()
}

let stashCountBar: vscode.StatusBarItem | null = null
export async function updateStashCountBar() {
	const workspace = await Util.getCurrentWorkspace()
	if (workspace) {
		const result = await Git.run(workspace.uri, 'stash', 'list')
		const stashList = compact(result.split('\n'))
		if (stashList.length > 0) {
			if (!stashCountBar) {
				stashCountBar = vscode.window.createStatusBarItem(
					vscode.StatusBarAlignment.Left,
					5,
				)
			}

			stashCountBar.text = `${stashList.length} Stash${stashList.length > 1 ? 'es' : ''}`
			stashCountBar.command = 'gitGrace.stashPop'
			stashCountBar.show()

			return
		}
	}

	if (stashCountBar) {
		stashCountBar.dispose()
		stashCountBar = null
	}
}
