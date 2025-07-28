import trim from 'lodash/trim'
import uniq from 'lodash/uniq'
import open from 'open'
import * as vscode from 'vscode'

import * as Git from './Git'
import Telemetry from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const workspacePath = workspace.uri.fsPath

	const webOrigin = await Git.getWebOrigin(workspace)
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

	const items: Array<vscode.QuickPickItem & { url: string }> = []

	const commitHash = await Git.getPushedCommitHash(workspace.uri)
	if (commitHash) {
		if (filePath) {
			items.push({
				label: commitHash,
				url:
					webOrigin +
					`/blob/${commitHash}/` +
					normalizeWebLocation(filePath) +
					lineHash,
			})
		} else {
			items.push({
				label: commitHash,
				url: webOrigin + `/commit/${commitHash}`,
			})
		}
	}

	const headBranchName = await Git.getRemoteHeadBranchName(workspace.uri)
	if (filePath) {
		items.push({
			label: headBranchName,
			url:
				webOrigin +
				'/blob/' +
				headBranchName +
				'/' +
				normalizeWebLocation(filePath) +
				lineHash,
		})
	} else if (workspacePath === repositoryPath) {
		items.push({
			label: headBranchName,
			url: webOrigin,
		})
	} else {
		items.push({
			label: headBranchName,
			url:
				webOrigin +
				'/tree/' +
				headBranchName +
				'/' +
				normalizeWebLocation(workspacePath),
		})
	}

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.local && status.local !== 'master' && status.remote) {
		if (filePath) {
			items.push({
				label: status.remote,
				url:
					webOrigin +
					`/blob/${status.local}/` +
					normalizeWebLocation(filePath) +
					lineHash,
			})
		} else if (workspacePath === repositoryPath) {
			items.push({
				label: status.remote,
				url: webOrigin + `/tree/${status.local}`,
			})
		} else {
			items.push({
				label: status.remote,
				url:
					webOrigin +
					`/tree/${status.local}/` +
					normalizeWebLocation(workspacePath),
			})
		}
	}

	if (items.length === 0) {
		return
	}

	if (items.length === 1) {
		open(items[0].url)

		Telemetry.logUsage('open-web', { webOrigin })

		return
	}

	const select = await vscode.window.showQuickPick(
		items.map((pick) => ({
			...pick,
			description: workspace.name,
		})),
		{ placeHolder: 'Select a reference to open in GitHub' },
	)

	if (select) {
		open(select.url)

		Telemetry.logUsage('open-web', { webOrigin })
	}
}

export async function getLineHashForGitHub(
	editor: vscode.TextEditor,
): Promise<string> {
	if (await Git.getFileStatus(editor.document.uri)) {
		return ''
	}

	return (
		'#' +
		uniq([
			editor.selections.at(0)!.start.line,
			editor.selections.at(-1)!.end.line,
		])
			.map((no) => 'L' + (no + 1))
			.join('-')
	)
}
