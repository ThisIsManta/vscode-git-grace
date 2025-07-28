import trim from 'lodash/trim'
import open from 'open'
import * as vscode from 'vscode'

import * as Git from './Git'
import { getLineHashForGitHub } from './openWeb'
import Telemetry from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const webOrigin = await Git.getWebOrigin(workspace)

	const currentFile = Util.getCurrentFile()
	const renamedFile = await Git.getFileBeforeRenamed(currentFile)
	const repositoryLink = Git.getRepositoryLink(currentFile)
	if (!repositoryLink) {
		return
	}

	const relativeFilePath = trim(
		(renamedFile || currentFile).fsPath
			.substring(repositoryLink.fsPath.length)
			.replace(/\\/g, '/'),
		'/',
	)

	const commitHash = await Git.getPushedCommitHash(workspace.uri)
	const lineHash = await getLineHashForGitHub(vscode.window.activeTextEditor!)

	open(webOrigin + '/blame/' + commitHash + '/' + relativeFilePath + lineHash)

	Telemetry.logUsage('blame')
}
