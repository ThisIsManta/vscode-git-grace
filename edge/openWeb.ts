import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as open from 'open'

import * as Util from './Util'
import * as Git from './Git'

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()

	const httpList: Array<string> = []
	for (const workspace of workspaceList) {
		const gitPath = Git.getRepositoryPath(workspace.uri)
		const httpPath = await Git.getHttpPath(workspace)
		if (!httpPath) {
			continue
		}

		if (httpPath.startsWith('https://github.com/') === false) {
			continue
		}

		const workspacePath = workspace.uri.fsPath
		let filePath = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.document.uri.fsPath
			: ''
		if (Git.getRepositoryPath(filePath) === null) {
			filePath = null
		}

		const remoteBranches = await Git.getRemoteBranchNames(workspace.uri)
		if (remoteBranches.indexOf('origin/master') >= 0) {
			if (workspacePath !== gitPath) {
				httpList.push(httpPath + '/tree/master/' + Util.getHttpPart(workspacePath.substring(gitPath.length)))
			}

			if (filePath) {
				httpList.push(httpPath + '/tree/master/' + Util.getHttpPart(filePath.substring(gitPath.length)))
			}
		}

		const status = await Git.getCurrentBranchStatus(workspace.uri)
		if (status.local && status.local !== 'master' && status.remote) {
			httpList.push(httpPath + `/tree/${status.local}/` + Util.getHttpPart(workspacePath.substring(gitPath.length)))

			if (filePath) {
				httpList.push(httpPath + `/tree/${status.local}/` + Util.getHttpPart(filePath.substring(gitPath.length)))
			}
		}
	}

	if (httpList.length === 0) {
		return null
	}

	if (httpList.length === 1) {
		open(httpList[0])
		return null
	}

	const pickList = httpList.map(http => {
		const host = http.match(/^https?:\/\/[\w.]+\//)[0]
		return {
			label: _.trimEnd(http.substring(host.length), '/'),
			description: _.trimEnd(host, '/'),
		}
	})

	const pick = await vscode.window.showQuickPick(pickList)
	if (pick) {
		open(pick.description + '/' + pick.label)
		return null
	}
}