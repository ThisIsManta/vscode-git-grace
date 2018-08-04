import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Util from './Util'
import * as Git from './Git'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const email = (await Git.run(workspace.uri, 'config', 'user.email')).trim()

	const messages = await Git.run(workspace.uri, '--no-pager', 'log', '--max-count=500', '--no-merges', '--format=%s', '--author=' + email)
	const messageList = messages.trim().split('\n')
	const messageStat = _.countBy(messageList)
	const pickList = _.sortBy(_.uniq(messageList), message => -messageStat[message])

	// TODO: change this when QuickPick API accepts free-text input
	const pick = await vscode.window.showQuickPick(pickList, { ignoreFocusOut: true })
	if (pick) {
		const repositoryList = await Git.getBuiltInGitExtension().exports.getRepositories()
		const sourceControlPanel = repositoryList.find(repository => repository.rootUri.fsPath === workspace.uri.fsPath)
		if (sourceControlPanel) {
			sourceControlPanel.inputBox.value = pick
		}
	}

	await vscode.commands.executeCommand('workbench.view.scm')
}