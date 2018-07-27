import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as open from 'open'

import * as Shared from './shared'

export default async function () {
	const repoList = await Shared.getRepositoryList()

	const httpList: Array<string> = []
	for (const repo of repoList) {
		if (repo.http.startsWith('https://github.com/') === false) {
			continue
		}

		const rootPath = repo.root.uri.fsPath
		let workPath = _.get(vscode.window.activeTextEditor, 'document.fileName', '') as string
		if (Shared.getGitFolder(workPath) === null) {
			workPath = null
		}

		const remoteBranches = await Shared.getRemoteBranchNames(repo.root.uri)
		if (remoteBranches.indexOf('origin/master') >= 0) {
			if (rootPath !== repo.path) {
				httpList.push(repo.http + '/tree/master/' + Shared.getHttpPart(rootPath.substring(repo.path.length)))
			}

			if (workPath) {
				httpList.push(repo.http + '/tree/master/' + Shared.getHttpPart(workPath.substring(repo.path.length)))
			}
		}

		const status = await Shared.getCurrentBranchStatus(repo.root.uri)
		if (status.local && status.local !== 'master' && status.remote) {
			httpList.push(repo.http + `/tree/${status.local}/` + Shared.getHttpPart(rootPath.substring(repo.path.length)))

			if (workPath) {
				httpList.push(repo.http + `/tree/${status.local}/` + Shared.getHttpPart(workPath.substring(repo.path.length)))
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