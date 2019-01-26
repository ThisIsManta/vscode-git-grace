import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'

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

	const pick = vscode.window.createQuickPick()
	pick.items = pickList
	pick.activeItems = []
	pick.onDidChangeValue(() => {
		pick.activeItems = []
	})
	pick.onDidAccept(async () => {
		pick.hide()

		const repositoryList = await Git.getBuiltInGitExtension().exports.getRepositories()
		const sourceControlPanel = repositoryList.find(repository => repository.rootUri.fsPath === workspace.uri.fsPath)
		if (sourceControlPanel) {
			sourceControlPanel.inputBox.value = pick.activeItems.length > 0 ? pick.activeItems[0].label : _.upperFirst(pick.value)
		}

		await vscode.commands.executeCommand('workbench.view.scm')
	})
	pick.show()
}