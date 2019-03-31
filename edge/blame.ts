import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as open from 'open'

import * as Util from './Util'
import * as Git from './Git'
import { track } from './Amplitude'

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

	const commitHash = await Git.getCommitHash(workspace.uri)

	const currentFile = Util.getCurrentFile()
	const renamedFile = await Util.getCurrentFileBeforeRenamed()
	const repositoryPath = Git.getRepositoryLink(currentFile).fsPath
	const relativeFilePath = _.trim((renamedFile || currentFile).fsPath.substring(repositoryPath.length).replace(/\\/g, '/'), '/')

	open(webOrigin + '/blame/' + commitHash + '/' + relativeFilePath)
}
