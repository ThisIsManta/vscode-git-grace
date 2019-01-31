import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as open from 'open'

import * as Util from './Util'
import * as Git from './Git'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}
	const workspacePath = workspace.uri.fsPath

	const gitPath = Git.getRepositoryPath(workspace.uri)
	function normalizeWebLocation(path: string) {
		return _.trim(path.substring(gitPath.length).replace(/\\/g, '/'), '/')
	}

	const webOrigin = await Git.getWebOrigin(workspace)
	if (!webOrigin || webOrigin.startsWith('https://github.com/') === false) {
		return null
	}

	const filePath = vscode.window.activeTextEditor && Git.getRepositoryPath(vscode.window.activeTextEditor.document.uri.fsPath)
		? vscode.window.activeTextEditor.document.uri.fsPath
		: ''

	const pickList: Array<vscode.QuickPickItem & { url: string, kind: number }> = []

	const commitHash = await Git.getCommitHash(workspace.uri)
	if (commitHash) {
		if (filePath) {
			pickList.push({
				label: commitHash,
				url: webOrigin + `/blob/${commitHash}/` + normalizeWebLocation(filePath),
				kind: 1,
			})

		} else {
			pickList.push({
				label: commitHash,
				url: webOrigin + `/commit/${commitHash}`,
				kind: 2,
			})
		}
	}

	const remoteBranches = await Git.getRemoteBranchNames(workspace.uri)
	if (remoteBranches.indexOf('origin/master') >= 0) {
		if (filePath) {
			pickList.push({
				label: 'origin/master',
				url: webOrigin + '/blob/master/' + normalizeWebLocation(filePath),
				kind: 3,
			})

		} else if (workspacePath === gitPath) {
			pickList.push({
				label: 'origin/master',
				url: webOrigin,
				kind: 4,
			})

		} else {
			pickList.push({
				label: 'origin/master',
				url: webOrigin + '/tree/master/' + normalizeWebLocation(workspacePath),
				kind: 5,
			})
		}
	}

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.local && status.local !== 'master' && status.remote) {
		if (filePath) {
			pickList.push({
				label: status.remote,
				url: webOrigin + `/blob/${status.local}/` + normalizeWebLocation(filePath),
				kind: 6,
			})

		} else if (workspacePath === gitPath) {
			pickList.push({
				label: status.remote,
				url: webOrigin + `/tree/${status.local}`,
				kind: 7,
			})

		} else {
			pickList.push({
				label: status.remote,
				url: webOrigin + `/tree/${status.local}/` + normalizeWebLocation(workspacePath),
				kind: 8,
			})
		}
	}

	if (pickList.length === 0) {
		return null
	}

	if (pickList.length === 1) {
		open(pickList[0].url)
		return null
	}

	const pick = await vscode.window.showQuickPick(pickList.map(pick => ({ ...pick, description: workspace.name })))
	if (pick) {
		open(pick.url)

		track('open-web', { kind: pick.kind })

		return null
	}
}