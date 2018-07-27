import * as cp from 'child_process'
import * as vscode from 'vscode'

import * as Shared from './shared'

// Slightly modified from https://github.com/mbinic/vscode-tgit/blob/master/src/TGit.ts

export default class TortoiseGit {
    private getWorkingFile: () => vscode.Uri
    private getRootFolder: () => Promise<vscode.WorkspaceFolder>
    private getGitPath: (link: vscode.Uri) => string
    private launcherPath: string

    constructor() {
        this.getWorkingFile = Shared.getCurrentFile
        this.getRootFolder = Shared.getCurrentWorkspace
        this.getGitPath = Shared.getGitPath

        this.updateConfiguration()

        vscode.workspace.onDidChangeConfiguration(() => {
            this.updateConfiguration()
        })
    }

    private updateConfiguration() {
        this.launcherPath = vscode.workspace.getConfiguration('gitGrace').get('tortoiseGitPath')
    }

    public fetch() {
        return this.run('fetch')
    }

    public showLog() {
        return this.run('log')
    }

    public showFileLog() {
        return this.run('log', true)
    }

    public commit() {
        return this.run('commit')
    }

    public revert() {
        return this.run('revert')
    }

    public cleanup() {
        return this.run('cleanup')
    }

    public resolve() {
        return this.run('resolve', true)
    }

    public switch() {
        return this.run('switch')
    }

    public merge() {
        return this.run('merge')
    }

    public diff() {
        return this.run('diff', true)
    }

    public blame() {
        let line = 1
        if (vscode.window.activeTextEditor) {
            line = vscode.window.activeTextEditor.selection.active.line + 1
        }
        return this.run('blame', true, `/line:${line}`)
    }

    public pull() {
        return this.run('pull')
    }

    public push() {
        return this.run('push')
    }

    public rebase() {
        return this.run('rebase')
    }

    public stashSave() {
        return this.run('stashsave')
    }

    public stashPop() {
        return this.run('stashpop')
    }

    public stashList() {
        return this.run('reflog', false, '/ref:"refs/stash"')
    }

    public sync() {
        return this.run('sync')
    }

    private async run(command: string, withFilePath: boolean = false, additionalParams: string = null) {
        if (withFilePath && !this.getWorkingFile()) {
            return null
        }

        let folderPath = await this.getRootFolder()
        if (!folderPath) {
            return null
        }

        let executable = `"${this.launcherPath}" /command:${command}`
        if (withFilePath) {
            executable += ` /path:"${this.getWorkingFile().fsPath}"`
        }
        if (additionalParams) {
            executable += ' ' + additionalParams
        }
        cp.exec(executable, { cwd: this.getGitPath(folderPath.uri) })
    }
}
