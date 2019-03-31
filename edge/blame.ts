import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as open from 'open'

import * as Util from './Util'
import * as Git from './Git'
import { track } from './Amplitude'
import { getLineHashForGitHub } from './openWeb'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const webOrigin = Git.getWebOrigin(workspace)
	if (!webOrigin) {
		throw `The selected workspace was not a GitHub repository.`
	}

	track('blame')

	const currentFile = Util.getCurrentFile()
	const renamedFile = await Git.getFileBeforeRenamed(currentFile)
	const repositoryLink = Git.getRepositoryLink(currentFile)
	const relativeFilePath = _.trim((renamedFile || currentFile).fsPath.substring(repositoryLink.fsPath.length).replace(/\\/g, '/'), '/')

	const commitHash = await Git.getCommitHash(workspace.uri)
	const lineHash = await getLineHashForGitHub(vscode.window.activeTextEditor)

	open(webOrigin + '/blame/' + commitHash + '/' + relativeFilePath + lineHash)
}
