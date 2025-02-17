import * as cp from 'child_process'
import compact from 'lodash/compact'
import * as vscode from 'vscode'

import * as Git from './Git'
import Log from './Log'
import Telemetry from './Telemetry'
import * as Util from './Utility'

// Slightly modified from https://github.com/mbinic/vscode-tgit/blob/master/src/TGit.ts
export default class TortoiseGit {
	public fetch() {
		return this.run('fetch')
	}

	public showLog() {
		Telemetry.logUsage('tortoise:show-log')

		return this.run('log')
	}

	public showFileLog() {
		Telemetry.logUsage('tortoise:show-file-log')

		return this.run('log', true)
	}

	public commit() {
		Telemetry.logUsage('tortoise:commit')

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

		Telemetry.logUsage('tortoise:blame')

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

	private executablePath = ''

	private async run(command: string, withFilePath: boolean = false, additionalParams: string | null = null) {
		if (!this.executablePath) {
			try {
				this.executablePath = cp.execSync('where TortoiseGitProc.exe').toString().trim()

			} catch (error) {
				Log.appendLine(String(error))
				vscode.window.showErrorMessage('TortoiseGit is not found. Please make sure it is installed and added to PATH.')

				return
			}
		}

		if (withFilePath && !Util.getCurrentFile()) {
			return
		}

		const folderPath = await Util.getCurrentWorkspace()
		if (!folderPath) {
			return
		}

		cp.exec(compact([
			`"${this.executablePath}"`,
			`/command:${command}`,
			withFilePath && `/path:"${Util.getCurrentFile().fsPath}"`,
			additionalParams,
		]).join(' '), { cwd: Git.getRepositoryLink(folderPath.uri)?.fsPath })
			.on('error', error => {
				Log.appendLine(String(error))
			})
	}
}
