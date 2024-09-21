import trim from 'lodash/trim'
import uniq from 'lodash/uniq'
import open from 'open'
import * as vscode from 'vscode'

import * as Git from './Git'
import { track } from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const workspacePath = workspace.uri.fsPath

	const webOrigin = Git.getWebOrigin(workspace)
	if (!webOrigin || webOrigin.startsWith('https://github.com/') === false) {
		return
	}

	const repositoryPath = Git.getRepositoryLink(workspace.uri)?.fsPath
	if (!repositoryPath) {
		return
	}

	function normalizeWebLocation(path: string) {
		return trim(path.substring(repositoryPath!.length).replace(/\\/g, '/'), '/')
	}

	const currentFile = Util.getCurrentFile()
	const renamedFile = await Git.getFileBeforeRenamed(currentFile)
	const filePath = Git.getRepositoryLink(currentFile)
		? (renamedFile || currentFile).fsPath
		: ''

	const lineHash = await getLineHashForGitHub(vscode.window.activeTextEditor!)

	const pickList: Array<vscode.QuickPickItem & { url: string }> = []

	const commitHash = await Git.getPushedCommitHash(workspace.uri)
	if (commitHash) {
		if (filePath) {
			pickList.push({
				label: commitHash,
				url: webOrigin + `/blob/${commitHash}/` + normalizeWebLocation(filePath) + lineHash,
			})

		} else {
			pickList.push({
				label: commitHash,
				url: webOrigin + `/commit/${commitHash}`,
			})
		}
	}

	const remoteBranches = await Git.getRemoteBranches(workspace.uri)
	for (const branchName of ['origin/master', 'origin/dev']) {
		if (remoteBranches.some(branch => branch.name === branchName)) {
			if (filePath) {
				pickList.push({
					label: branchName,
					url: webOrigin + '/blob/master/' + normalizeWebLocation(filePath) + lineHash,
				})

			} else if (workspacePath === repositoryPath) {
				pickList.push({
					label: branchName,
					url: webOrigin,
				})

			} else {
				pickList.push({
					label: branchName,
					url: webOrigin + '/tree/master/' + normalizeWebLocation(workspacePath),
				})
			}
		}
	}

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.local && status.local !== 'master' && status.remote) {
		if (filePath) {
			pickList.push({
				label: status.remote,
				url: webOrigin + `/blob/${status.local}/` + normalizeWebLocation(filePath) + lineHash,
			})

		} else if (workspacePath === repositoryPath) {
			pickList.push({
				label: status.remote,
				url: webOrigin + `/tree/${status.local}`,
			})

		} else {
			pickList.push({
				label: status.remote,
				url: webOrigin + `/tree/${status.local}/` + normalizeWebLocation(workspacePath),
			})
		}
	}

	if (pickList.length === 0) {
		return
	}

	if (pickList.length === 1) {
		open(pickList[0].url)

		return
	}

	const select = await vscode.window.showQuickPick(
		pickList.map(pick => ({
			...pick,
			description: workspace.name,
		})),
		{ placeHolder: 'Select a reference to open in GitHub' },
	)

	if (select) {
		open(select.url)

		track('open-web', { kind: String(select.kind) })
	}
}

export async function getLineHashForGitHub(editor: vscode.TextEditor): Promise<string> {
	if (await Git.getFileStatus(editor.document.uri)) {
		return ''
	}

	return '#' + uniq([
		editor.selections.at(0)!.start.line,
		editor.selections.at(-1)!.end.line,
	]).map(no => 'L' + (no + 1))
		.join('-')
}
