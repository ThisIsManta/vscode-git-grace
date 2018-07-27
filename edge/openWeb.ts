import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as open from 'open'

import * as Shared from './shared'

export default async function () {
	const repositoryList = await Shared.getRepositoryList()

	const httpList: Array<string> = []
	for (const repository of repositoryList) {
		if (repository.http.startsWith('https://github.com/') === false) {
			continue
		}

		const workspacePath = repository.workspace.uri.fsPath
		let workPath = _.get(vscode.window.activeTextEditor, 'document.fileName', '') as string
		if (Shared.getGitPath(workPath) === null) {
			workPath = null
		}

		const remoteBranches = await Shared.getRemoteBranchNames(repository.workspace.uri)
		if (remoteBranches.indexOf('origin/master') >= 0) {
			if (workspacePath !== repository.path) {
				httpList.push(repository.http + '/tree/master/' + Shared.getHttpPart(workspacePath.substring(repository.path.length)))
			}

			if (workPath) {
				httpList.push(repository.http + '/tree/master/' + Shared.getHttpPart(workPath.substring(repository.path.length)))
			}
		}

		const status = await Shared.getCurrentBranchStatus(repository.workspace.uri)
		if (status.local && status.local !== 'master' && status.remote) {
			httpList.push(repository.http + `/tree/${status.local}/` + Shared.getHttpPart(workspacePath.substring(repository.path.length)))

			if (workPath) {
				httpList.push(repository.http + `/tree/${status.local}/` + Shared.getHttpPart(workPath.substring(repository.path.length)))
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