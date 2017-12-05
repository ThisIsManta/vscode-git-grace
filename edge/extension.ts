import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as os from 'os'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as process from 'process'

// const Git = require('simple-git')
let chan: vscode.OutputChannel

export function activate(context: vscode.ExtensionContext) {
    chan = vscode.window.createOutputChannel('Git Grace')

    const gitPath = vscode.workspace.getConfiguration('git').get<string>('path', os.platform() === 'win32' ? 'C:/Program Files/Git/bin/git.exe' : 'git')
    const git = (rootLink: vscode.Uri, ...parameters: Array<string>) => {
        chan.appendLine('git ' + parameters.join(' '))

        console.log(new Date());
        
        const result = cp.spawnSync(gitPath, parameters, {
            cwd: rootLink.fsPath.replace(new RegExp(_.escapeRegExp(fp.win32.sep), 'g'), fp.posix.sep),
            encoding: 'utf-8',
        })
        
        console.log(new Date());

        const output = String(result.stdout || '').trim()
        if (output) {
            chan.appendLine(output)
        }

        const error = String(result.stderr || '').trim()
        if (error) {
            chan.appendLine(error)
        }

        return { error, output }
    }

    context.subscriptions.push(vscode.commands.registerCommand('gitGrace.fetch', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Fetching' }, async () => {
            getTotalRootFolders().forEach(link => {
                const { error, output } = git(link.uri, 'fetch', '--prune', 'origin')
                
            })
        })
    }))
}

export function deactivate() {
    if (chan) {
        chan.dispose()
    }
}

function getCurrentRootFolder() {
    if (!vscode.window.activeTextEditor) {
        return null
    }

    const rootLink = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
    if (!rootLink) {
        return null
    }

    return rootLink
}

function getTotalRootFolders() {
    return vscode.workspace.workspaceFolders
}
