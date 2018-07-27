import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function urgent() {
	const rootList = Shared.getRootList()
	if (rootList.length === 0) {
		return null
	}

	if (await vscode.workspace.saveAll(true) === false) {
		return null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Pushing as Work-In-Progress...' }, async () => {
		for (const root of rootList) {
			const status = await Shared.getCurrentBranchStatus(root.uri)
			if (!status.dirty) {
				continue
			}

			await Shared.git(root.uri, 'commit', '--all', '--untracked-files', '--message=(work-in-progress)')

			const tagName = 'WIP/' + _.compact((new Date().toISOString()).split(/\W/)).join('-')
			await Shared.git(root.uri, 'tag', tagName)

			try {
				await Shared.retry(1, () => Shared.git(root.uri, 'push', '--no-verify', 'origin', 'refs/tags/' + tagName))
			} catch (ex) {
				throw `Pushing failed.`
			}
		}
	})

	vscode.commands.executeCommand('workbench.action.quit')
}

export async function urgentRestore(options = { prompt: false }) {
	const rootList = Shared.getRootList()
	if (rootList.length === 0) {
		return null
	}

	const waitList: Array<{ root: vscode.WorkspaceFolder, branchName: string, tagName: string, distance: number }> = []
	for (const root of rootList) {
		const status = await Shared.getCurrentBranchStatus(root.uri)
		if (status.dirty || !status.local) {
			continue
		}

		const tagNames = _.compact((await Shared.git(root.uri, 'tag', '--list')).split('\n')).filter(tagName => tagName.startsWith('WIP/'))
		tagNames.sort().reverse()
		for (const tagName of tagNames) {
			const result = await Shared.git(root.uri, 'rev-list', '--left-right', '--count', status.local + '...refs/tags/' + tagName)
			const [base, diff] = result.trim().match(/\d+/g)
			if (parseInt(base) === 0) {
				waitList.push({ root, branchName: status.local, tagName, distance: parseInt(diff) })

				break
			}
		}
	}

	if (waitList.length === 0) {
		return null
	}

	if (options.prompt) {
		const select = await vscode.window.showWarningMessage(
			`There ${waitList.length === 1 ? 'is' : 'are'} ${waitList.length} work-in-progress found.`,
			'Restore Work-In-Progress')
		if (!select) {
			return null
		}
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Restoring Work-In-Progress...' }, async () => {
		for (const { root, branchName, tagName, distance } of waitList) {
			if (distance >= 1) {
				await Shared.git(root.uri, 'checkout', '-B', branchName, 'refs/tags/' + tagName)
			}

			await Shared.git(root.uri, 'reset', '--mixed', 'HEAD~1')

			await Shared.git(root.uri, 'tag', '--delete', tagName)
			await Shared.git(root.uri, 'push', '--delete', 'origin', 'refs/tags/' + tagName)
		}
	})

	vscode.commands.executeCommand('git.refresh')
}