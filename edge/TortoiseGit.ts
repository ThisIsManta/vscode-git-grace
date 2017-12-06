import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'

// Slightly modified from https://github.com/mbinic/vscode-tgit/blob/master/src/TGit.ts
export default class TortoiseGit {
    public static fetch() {
        TortoiseGit.run('fetch', false)
    }

    public static showLog() {
        TortoiseGit.run('log')
    }

    public static showFileLog() {
        TortoiseGit.run('log', true)
    }

    public static commit() {
        TortoiseGit.run('commit')
    }

    public static revert() {
        TortoiseGit.run('revert')
    }

    public static cleanup() {
        TortoiseGit.run('cleanup')
    }

    public static resolve() {
        TortoiseGit.run('resolve', true)
    }

    public static switch() {
        TortoiseGit.run('switch')
    }

    public static merge() {
        TortoiseGit.run('merge')
    }

    public static diff() {
        TortoiseGit.run('diff', true)
    }

    public static blame() {
        let line = 1
        if (vscode.window.activeTextEditor) {
            line = vscode.window.activeTextEditor.selection.active.line + 1
        }
        TortoiseGit.run('blame', true, `/line:${line}`)
    }

    public static pull() {
        TortoiseGit.run('pull')
    }

    public static push() {
        TortoiseGit.run('push')
    }

    public static rebase() {
        TortoiseGit.run('rebase')
    }

    public static stashSave() {
        TortoiseGit.run('stashsave')
    }

    public static stashPop() {
        TortoiseGit.run('stashpop')
    }

    public static stashList() {
        TortoiseGit.run('reflog', false, '/ref:"refs/stash"')
    }

    public static sync() {
        TortoiseGit.run('sync')
    }

    private static run(command: string, withFilePath: boolean = false, additionalParams: string = null) {
        let workingDir = this.getRootGitFolder()
        let targetPath = withFilePath ? this.getWorkingFile() : workingDir
        if (!workingDir || workingDir == '.' || !targetPath || targetPath == '.') {
            vscode.window.showErrorMessage(`This command requires an existing file ${withFilePath ? '' : 'or folder'} to be opened.`)
            return
        }

        let launcherPath = vscode.workspace.getConfiguration('gitGrace').get('tortoiseGitPath')
        let cmd = `"${launcherPath}" /command:${command}`
        if (withFilePath) {
            cmd += ` /path:"${targetPath}"`
        }
        if (additionalParams) {
            cmd += ' ' + additionalParams
        }
        require('child_process').exec(cmd, { cwd: workingDir })
    }

    private static getRootGitFolder() {
        let workingDir = this.getWorkingDirectory()
        let rootDir = workingDir
        while (!fs.existsSync(rootDir + fp.sep + '.git')) {
            let parentDir = fp.dirname(rootDir)
            if (rootDir == parentDir) {
                rootDir = null
                break
            }
            else {
                rootDir = parentDir
            }
        }
        return rootDir || workingDir
    }

    private static getWorkingDirectory() {
        let currentFile = this.getWorkingFile()
        if (!currentFile) {
            if (vscode.workspace.workspaceFolders.length > 0) {
                return vscode.workspace.workspaceFolders[0].uri.fsPath
            }
            return null
        }

        const rootPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(currentFile))
        if (rootPath) {
            return rootPath.uri.fsPath
        }

        return fp.dirname(currentFile)
    }

    private static getWorkingFile() {
        if (vscode.window.activeTextEditor) {
            return vscode.window.activeTextEditor.document.fileName
        }
        return null
    }
}