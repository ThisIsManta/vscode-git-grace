import * as open from 'open'

import * as Shared from './shared'
import push from './push'

export default async function() {
	const workspace = await Shared.getCurrentWorkspace()
	if (!workspace) {
		return null
	}

	let repositoryList = await Shared.getRepositoryList()
	if (repositoryList.length === 0) {
		return null
	}

	const repository = repositoryList.find(item => item.workspace.uri.fsPath === workspace.uri.fsPath)
	if (repository === undefined) {
		throw `The selected workspace was not a GitHub repository.`
	}

	const status = await Shared.getCurrentBranchStatus(workspace.uri)
	if (status.dirty) {
		throw `The current repository is dirty.`
	}
	if (status.local === '') {
		throw `The current repository is not attached to any branches.`
	}
	if (status.local === 'master') {
		throw `The current branch is branch "master".`
	}
	if (status.sync === Shared.SyncStatus.Behind) {
		throw `The current branch was behind its remote branch.`
	}
	if (status.sync === Shared.SyncStatus.OutOfSync) {
		throw `The current branch was out-of-sync with its remote branch.`
	}
	if (status.remote === '' || status.sync === Shared.SyncStatus.Ahead) {
		const error = await push()
		if (error !== undefined) {
			return null
		}
	}

	open(repository.http + '/compare/' + 'master' + '...' + (status.remote.replace(/^origin\//, '') || status.local))
}