import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'
import { track } from './Amplitude'

const versionMatcher = /^\d+\.\d+\.\d+$/
const endWithParenthesisMatcher = /\s*\(.+\)\s*$/

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const email = (await Git.run(workspace.uri, 'config', 'user.email')).trim()

	const messages = await Git.run(workspace.uri, 'log', '--max-count=500', '--no-merges', '--format=%s', '--author=' + email)
	const pickList = _.chain(messages.trim().split('\n'))
		.reject(message => versionMatcher.test(message))
		.map(message => message.replace(endWithParenthesisMatcher, ''))
		.uniq()
		.compact()
		.map(message => ({ label: message } as vscode.QuickPickItem))
		.value()

	await vscode.commands.executeCommand('workbench.view.scm')

	const picker = vscode.window.createQuickPick()
	picker.items = pickList
	picker.activeItems = []
	picker.onDidChangeValue(() => {
		picker.activeItems = []
	})
	picker.onDidAccept(async () => {
		picker.hide()

		const repositoryList = await Git.getGitBuiltInExtension().exports.getAPI(1).repositories
		const sourceControlPanel = repositoryList.find(repository => repository.rootUri.fsPath === workspace.uri.fsPath)
		if (sourceControlPanel) {
			sourceControlPanel.inputBox.value = picker.activeItems.length > 0 ? picker.activeItems[0].label : _.upperFirst(picker.value)
		}

		track('commit-smart')

		await vscode.commands.executeCommand('workbench.view.scm')
	})
	picker.show()
}