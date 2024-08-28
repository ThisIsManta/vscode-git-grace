import * as vscode from 'vscode'

import * as Git from './Git'
import * as Util from './Util'
import * as Queue from './Queue'
import fetch from './fetch'
import pull from './pull'
import push from './push'
import commitSmart from './commitSmart'
import commitAmend from './commitAmend'
import commitEmpty from './commitEmpty'
import stash, { stashPopLatest, stashPop, stashClear, updateStashCountBar } from './stash'
import squash from './squash'
import master from './master'
import branch from './branch'
import checkout from './checkout'
import openWeb from './openWeb'
import pullRequest from './pullRequest'
import blame from './blame'
import cleanAll from './cleanAll'
import sync from './sync'
import deleteBranch from './deleteBranch'
import deleteMergedBranches from './deleteMergedBranches'
import sleep from './sleep'
import TortoiseGit from './TortoiseGit'
import Log from './Log'
import stageAll from './stageAll'
import unstageAll from './unstageAll'
import { telemetry } from './Telemetry'

export async function activate(context: vscode.ExtensionContext) {
	// Prevent "No Git repository" error throwing from built-in Git extension
	while (Git.getGitBuiltInExtension().isActive === false) {
		await sleep(500)
	}

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(updateStashCountBar))

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(Util.updateWorkspaceList))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.stageAll', Queue.put(stageAll)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.unstageAll', Queue.put(unstageAll)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.cleanAll', Queue.put(cleanAll)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.fetch', Queue.put(fetch)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pull', Queue.put(pull)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.push', Queue.put(push)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitSmart', Queue.put(commitSmart, [commitSmart])))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitAmend', Queue.put(commitAmend)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitEmpty', Queue.put(commitEmpty)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.stash', Queue.put(stash)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.stashPopLatest', Queue.put(stashPopLatest)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.stashPop', Queue.put(stashPop)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.stashClear', Queue.put(stashClear)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.squash', squash))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.master', Queue.put(master, [fetch])))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.branch', Queue.put(branch)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.checkout', Queue.put(checkout, [fetch])))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.openWeb', Queue.put(openWeb)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pullRequest', Queue.put(pullRequest)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.blame', Queue.put(blame)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.sync', Queue.put(sync)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.deleteBranch', Queue.put(deleteBranch)))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.deleteMergedBranches', Queue.put(deleteMergedBranches, [fetch])))

	context.subscriptions.push(vscode.commands.registerCommand('gitGrace.showOutput', () => {
		Log.show()
	}))

	const tortoiseGit = new TortoiseGit()
	context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.showLog', Queue.put(() => tortoiseGit.showLog())))
	context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.showFileLog', Queue.put(() => tortoiseGit.showFileLog())))
	context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.commit', Queue.put(() => tortoiseGit.commit())))
	context.subscriptions.push(vscode.commands.registerCommand('tortoiseGit.blame', () => tortoiseGit.blame()))

	if (vscode.workspace.workspaceFolders) {
		await Queue.run(fetch)
		await updateStashCountBar()
	}
}

export async function deactivate() {
	Queue.clear()

	if (Log) {
		Log.hide()
		Log.dispose()
	}

	await telemetry.dispose()
}
