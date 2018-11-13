import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'

export default async function urgent() {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	if (await vscode.workspace.saveAll(true) === false) {
		return null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Pushing Work-In-Progress...' }, async () => {
		for (const workspace of workspaceList) {
			const status = await Git.getCurrentBranchStatus(workspace.uri)
			if (!status.dirty) {
				continue
			}

			await Git.run(workspace.uri, 'commit', '--all', '--untracked-files', '--message=(work-in-progress)')

			const tagName = 'WIP/' + _.compact((new Date().toISOString()).split(/\W/)).join('-')
			await Git.run(workspace.uri, 'tag', tagName)

			try {
				await Git.run(workspace.uri, 'push', '--no-verify', 'origin', 'refs/tags/' + tagName, { retry: 1 })
			} catch (ex) {
				throw `Pushing failed.`
			}
		}
	})

	vscode.commands.executeCommand('workbench.action.quit')
}

export async function urgentRestore(options = { prompt: false }) {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return null
	}

	const waitList: Array<{ workspace: vscode.WorkspaceFolder, branchName: string, tagName: string, distance: number }> = []
	for (const workspace of workspaceList) {
		const status = await Git.getCurrentBranchStatus(workspace.uri)
		if (status.dirty || status.local === '') {
			continue
		}

		const tagNames = _.compact((await Git.run(workspace.uri, 'tag', '--list')).split('\n')).filter(tagName => tagName.startsWith('WIP/'))
		tagNames.sort().reverse()
		for (const tagName of tagNames) {
			const result = await Git.run(workspace.uri, 'rev-list', '--left-right', '--count', status.local + '...refs/tags/' + tagName)
			const [base, diff] = result.trim().match(/\d+/g)
			if (parseInt(base) === 0) {
				waitList.push({ workspace, branchName: status.local, tagName, distance: parseInt(diff) })

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

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Restoring Work-In-Progress...' }, async () => {
		for (const { workspace, branchName, tagName, distance } of waitList) {
			if (distance >= 1) {
				await Git.run(workspace.uri, 'checkout', '-B', branchName, 'refs/tags/' + tagName)
			}

			await Git.run(workspace.uri, 'reset', '--mixed', 'HEAD~1')

			await Git.run(workspace.uri, 'tag', '--delete', tagName)
			await Git.run(workspace.uri, 'push', '--delete', 'origin', 'refs/tags/' + tagName)
		}
	})

	vscode.commands.executeCommand('git.refresh')
}