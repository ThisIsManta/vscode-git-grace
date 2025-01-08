import open from 'open'
import * as vscode from 'vscode'

import * as Git from './Git'
import push from './push'
import { track } from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const headBranchName = await Git.getRemoteHeadBranchName(workspace.uri)

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.local === '') {
		throw new Error('The current repository is not attached to any branches.')
	}

	if (status.local === headBranchName) {
		throw new Error(`The current branch is branch "${headBranchName}".`)
	}

	if (status.sync === Git.SyncStatus.LocalIsBehindRemote) {
		throw new Error('The local branch is out of sync with its remote branch.')
	}

	if (status.dirty) {
		const select = await vscode.window.showWarningMessage(
			'There are some uncommitted files.',
			{ modal: true },
			'Proceed Anyway',
		)

		if (select !== 'Proceed Anyway') {
			throw new vscode.CancellationError()
		}
	}

	if (status.remote === '' || status.sync !== Git.SyncStatus.LocalIsInSyncWithRemote) {
		await push()
	}

	track('pull-request')

	const webOrigin = await Git.getWebOrigin(workspace)

	open(webOrigin + '/compare/' + headBranchName + '...' + (status.remote.replace(/^origin\//, '') || status.local))
}
