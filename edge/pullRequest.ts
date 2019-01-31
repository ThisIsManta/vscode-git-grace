import * as open from 'open'

import * as Util from './Util'
import * as Git from './Git'
import push from './push'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	const webOrigin = Git.getWebOrigin(workspace)
	if (!webOrigin) {
		throw `The selected workspace was not a GitHub repository.`
	}

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		throw `The current repository is dirty.`
	}
	if (status.local === '') {
		throw `The current repository is not attached to any branches.`
	}
	if (status.local === 'master') {
		throw `The current branch is branch "master".`
	}
	if (status.sync === Git.SyncStatus.LocalIsBehindRemote) {
		throw `The current branch was behind its remote branch.`
	}
	if (status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote) {
		throw `The current branch was out-of-sync with its remote branch.`
	}
	if (status.remote === '' || status.sync === Git.SyncStatus.LocalIsAheadOfRemote) {
		const updated = await push()
		if (updated === null) {
			// Stop processing if the push operation is aborted
			return null
		}
	}

	track('pull-request')

	open(webOrigin + '/compare/' + 'master' + '...' + (status.remote.replace(/^origin\//, '') || status.local))
}