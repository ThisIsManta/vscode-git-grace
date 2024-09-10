import compact from 'lodash/compact'
import uniq from 'lodash/uniq'
import * as vscode from 'vscode'

import * as Git from './Git'
import { track } from './Telemetry'
import * as Util from './Utility'

const versionMatcher = /^\d+\.\d+\.\d+$/
const endWithParenthesisMatcher = /\s*\(.+\)\s*$/
export default async function (): Promise<void> {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	await Promise.all([
		vscode.commands.executeCommand('workbench.view.scm'),
		vscode.commands.executeCommand('git.refresh'),
	])

	const repositoryList = Git.getGitBuiltInExtension().exports.getAPI(1).repositories
	const sourceControlPanel = repositoryList.find(repository => repository.rootUri.fsPath === workspace.uri.fsPath)
	if (!sourceControlPanel) {
		return
	}

	if (
		sourceControlPanel.state.indexChanges.length +
		sourceControlPanel.state.workingTreeChanges.length === 0
	) {
		vscode.window.showErrorMessage('There are no files to be committed.', { modal: true })

		return
	}

	const picker = vscode.window.createQuickPick()
	picker.value = sourceControlPanel.inputBox.value
	picker.activeItems = []
	picker.onDidChangeValue(() => {
		picker.activeItems = []
	})
	picker.busy = true

	getHistoricalMessages(workspace)
		.then(messages => {
			picker.items = messages
		})
		.finally(() => {
			picker.busy = false
		})

	await new Promise<void>((resolve, reject) => {
		picker.onDidAccept(() => {
			sourceControlPanel.inputBox.value = picker.activeItems.length > 0 ? picker.activeItems[0].label : picker.value

			resolve()

			picker.dispose()
		})
		picker.onDidHide(() => {
			reject(new vscode.CancellationError())
		})
		picker.show()
	})

	track('commit-smart')

	await vscode.commands.executeCommand('git.commit')
}

async function getHistoricalMessages(workspace: vscode.WorkspaceFolder): Promise<Array<vscode.QuickPickItem>> {
	const email = (await Git.run(workspace.uri, 'config', 'user.email')).trim()

	const messages = await Git.run(workspace.uri, 'log', '--max-count=500', '--no-merges', '--format=%s', '--author=' + email)

	return compact(uniq(messages
		.trim()
		.split('\n')
		.filter(message => !versionMatcher.test(message))
		.map(message => message.replace(endWithParenthesisMatcher, ''))))
		.map(message => ({ label: message }))
}
