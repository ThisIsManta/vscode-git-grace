import open from 'open'

import * as Git from './Git'
import push from './push'
import { track } from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const webOrigin = Git.getWebOrigin(workspace)
	if (!webOrigin) {
		throw new Error('The selected workspace was not a GitHub repository.')
	}

	const headBranchName = await Git.getRemoteHeadBranchName(workspace.uri)

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		throw new Error('The current repository is dirty.')
	}

	if (status.local === '') {
		throw new Error('The current repository is not attached to any branches.')
	}

	if (status.local === headBranchName) {
		throw new Error(`The current branch is branch "${headBranchName}".`)
	}

	if (status.sync === Git.SyncStatus.LocalIsBehindRemote) {
		throw new Error('The current branch was behind its remote branch.')
	}

	if (status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote) {
		throw new Error('The current branch was out-of-sync with its remote branch.')
	}

	if (status.remote === '' || status.sync === Git.SyncStatus.LocalIsAheadOfRemote) {
		await push()
	}

	track('pull-request')

	open(webOrigin + '/compare/' + headBranchName + '...' + (status.remote.replace(/^origin\//, '') || status.local))
}
