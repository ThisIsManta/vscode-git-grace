import open from 'open'

import * as Util from './Utility'
import * as Git from './Git'
import push from './push'
import { track } from './Telemetry'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const webOrigin = Git.getWebOrigin(workspace)
	if (!webOrigin) {
		throw `The selected workspace was not a GitHub repository.`
	}

	const headBranchName = await Git.getRemoteHeadBranchName(workspace.uri)

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		throw `The current repository is dirty.`
	}
	if (status.local === '') {
		throw `The current repository is not attached to any branches.`
	}
	if (status.local === headBranchName) {
		throw `The current branch is branch "${headBranchName}".`
	}
	if (status.sync === Git.SyncStatus.LocalIsBehindRemote) {
		throw `The current branch was behind its remote branch.`
	}
	if (status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote) {
		throw `The current branch was out-of-sync with its remote branch.`
	}
	if (status.remote === '' || status.sync === Git.SyncStatus.LocalIsAheadOfRemote) {
		await push()
	}

	track('pull-request')

	open(webOrigin + '/compare/' + headBranchName + '...' + (status.remote.replace(/^origin\//, '') || status.local))
}