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
import urgent, { urgentRestore } from './urgent'
import stash, { stashPopLatest, stashPop, stashClear, updateStashCountBar } from './stash'
import squash from './squash'
import master from './master'
import branch from './branch'
import checkout from './checkout'
import openWeb from './openWeb'
import pullRequest from './pullRequest'
import blame from './blame'
import sync from './sync'
import deleteMergedBranches from './deleteMergedBranches'
import sleep from './sleep'
import TortoiseGit from './TortoiseGit'
import Log from './Log'

export async function activate(context: vscode.ExtensionContext) {
    // Prevent "No Git repository" error throwing from built-in Git extension
    while (Git.getGitBuiltInExtension().isActive === false) {
        await sleep(500)
    }

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(updateStashCountBar))

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(Util.updateWorkspaceList))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.fetch', Queue.put(fetch)))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.pull', Queue.put(pull)))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.push', Queue.put(push)))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitSmart', commitSmart))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitAmend', commitAmend))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.commitEmpty', commitEmpty))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.urgent', Queue.put(urgent)))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.urgentRestore', Queue.put(urgentRestore)))

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

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.deleteBranch', Queue.put(async () => vscode.commands.executeCommand('git.deleteBranch'))))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.deleteMergedBranches', Queue.put(deleteMergedBranches)))

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.deleteMergedBranches.cancel', Queue.put(async () => { /* Cancellation will be done by the second parameter of this `Queue.put()` */ }, [async () => {}, fetch, deleteMergedBranches])))

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
        await Queue.run(() => urgentRestore({ prompt: true }))
        await updateStashCountBar()
    }
}

export async function deactivate() {
    await vscode.commands.executeCommand('gitGrace.deleteMergedBranches.cancel')

    Queue.clear()

    if (Log) {
        Log.hide()
        Log.dispose()
    }
}
