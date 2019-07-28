import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { tryAbortBecauseOfDirtyFiles, tryAbortBecauseOfDanglingCommits } from './checkout'
import { track } from './Amplitude'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty && await tryAbortBecauseOfDirtyFiles(workspace.uri)) {
		return null
	}

	let targetBranch = 'origin/master'
	const remoteBranches = await Git.getRemoteBranchNames(workspace.uri)
	if (remoteBranches.some(branch => branch === 'origin/dev')) {
		const select = await new Promise<string>(resolve => {
			const picker = vscode.window.createQuickPick()
			picker.placeholder = 'Select a branch to headless checkout'
			picker.items = [{ label: 'dev' }, { label: 'master' }]
			picker.show()
			picker.onDidAccept(() => {
				picker.dispose()

				const [select] = picker.selectedItems
				resolve('origin/' + select.label)
			})
			picker.onDidHide(() => {
				resolve()
			})
		})
		if (!select) {
			return null
		}
		targetBranch = select
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Switching to ${targetBranch}...` }, async () => {
		await Git.run(workspace.uri, 'fetch', 'origin', { retry: 2 })

		if (status.local === '') {
			const currentHash = await Git.getCurrentCommitHash(workspace.uri)
			const masterHash = await Git.getCurrentCommitHash(workspace.uri, targetBranch)
			if (currentHash === masterHash) {
				vscode.window.showInformationMessage(`You are on "${targetBranch}" already.`)
				return null
			}

			if (await tryAbortBecauseOfDanglingCommits(workspace.uri, `"${targetBranch}"`)) {
				return null
			}
		}

		track('master')

		try {
			await Git.run(workspace.uri, 'checkout', '--detach', targetBranch)

		} catch (ex) {
			throw `Checking out "${targetBranch}" failed.`
		}

		vscode.commands.executeCommand('git.refresh')
	})
}
