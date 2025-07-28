import * as os from 'os'
import * as vscode from 'vscode'

import blame from './blame'
import branch from './branch'
import checkout from './checkout'
import cleanAll from './cleanAll'
import commitAmend from './commitAmend'
import commitEmpty from './commitEmpty'
import commitSmart from './commitSmart'
import deleteBranch from './deleteBranch'
import deleteMergedBranches from './deleteMergedBranches'
import * as Fork from './Fork'
import fetch from './fetch'
import Log from './Log'
import master from './master'
import openWeb from './openWeb'
import pull from './pull'
import pullRequest from './pullRequest'
import push from './push'
import * as Queue from './Queue'
import squash from './squash'
import stageAll from './stageAll'
import {
	stashClear,
	stashPop,
	stashPopLatest,
	stashPush,
	updateStashCountBar,
} from './stash'
import sync from './sync'
import Telemetry from './Telemetry'
import TortoiseGit from './TortoiseGit'
import * as Util from './Utility'
import unstageAll from './unstageAll'

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(updateStashCountBar),
	)

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(Util.updateWorkspaceList),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.stageAll', Queue.put(stageAll)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.unstageAll',
			Queue.put(unstageAll),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.cleanAll', Queue.put(cleanAll)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.fetch', Queue.put(fetch)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.pull', Queue.put(pull)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.push', Queue.put(push)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.commitSmart',
			Queue.put(commitSmart, [commitSmart]),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.commitAmend',
			Queue.put(commitAmend),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.commitEmpty',
			Queue.put(commitEmpty),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.stash', Queue.put(stashPush)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.stashPopLatest',
			Queue.put(stashPopLatest),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.stashPop', Queue.put(stashPop)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.stashClear',
			Queue.put(stashClear),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.squash', squash),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.master',
			Queue.put(master, [fetch]),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.branch', Queue.put(branch)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.checkout',
			Queue.put(checkout, [fetch]),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.openWeb', Queue.put(openWeb)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.pullRequest',
			Queue.put(pullRequest),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.blame', Queue.put(blame)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.sync', Queue.put(sync)),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.deleteBranch',
			Queue.put(deleteBranch),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'gitGrace.deleteMergedBranches',
			Queue.put(deleteMergedBranches, [fetch]),
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('gitGrace.showOutput', () => {
			Log.show()
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('fork.showLog', Queue.put(Fork.showLog)),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'fork.showFileLog',
			Queue.put(Fork.showFileLog),
		),
	)
	context.subscriptions.push(
		vscode.commands.registerCommand('fork.commit', Queue.put(Fork.commit)),
	)

	if (os.platform() === 'win32') {
		const tortoiseGit = new TortoiseGit()
		context.subscriptions.push(
			vscode.commands.registerCommand(
				'tortoiseGit.showLog',
				Queue.put(() => tortoiseGit.showLog()),
			),
		)
		context.subscriptions.push(
			vscode.commands.registerCommand(
				'tortoiseGit.showFileLog',
				Queue.put(() => tortoiseGit.showFileLog()),
			),
		)
		context.subscriptions.push(
			vscode.commands.registerCommand(
				'tortoiseGit.commit',
				Queue.put(() => tortoiseGit.commit()),
			),
		)
		context.subscriptions.push(
			vscode.commands.registerCommand('tortoiseGit.blame', () =>
				tortoiseGit.blame(),
			),
		)
	}

	if (vscode.workspace.workspaceFolders) {
		await Queue.run((options) =>
			fetch({
				silence: true,
				token: options?.token,
			}),
		)
		await updateStashCountBar()
	}
}

export async function deactivate() {
	Queue.clear()

	if (Log) {
		Log.hide()
		Log.dispose()
	}

	Telemetry.dispose()
}
