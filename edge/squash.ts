import compact from 'lodash/compact'
import trimEnd from 'lodash/trimEnd'
import last from 'lodash/last'
import * as vscode from 'vscode'

import * as Git from './Git'
import * as Util from './Util'
import { track } from './Amplitude'

export default async function () {
	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const workspace = await Util.getCurrentWorkspace()

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.dirty === false) {
		throw `Nothing is to be squashed.`
	}

	const originalCommitHash = await Git.getCurrentCommitHash(workspace.uri)

	const lastCommitText = await Git.run(workspace.uri, 'log', '--pretty=format:%H %s', '--no-merges', '--max-count=50', 'HEAD')
	const lastCommitList = trimEnd(lastCommitText).split('\n')
		.map(line => {
			const [commitHash, ...message] = line.split(' ')
			return { commitHash, label: message.join(' ') }
		})
	if (lastCommitList.length === 0) {
		throw `Nothing is to be squashed.`
	}

	const select = await vscode.window.showQuickPick(lastCommitList, { placeHolder: 'Select a commit to squash' })
	if (!select) {
		return null
	}

	let filesHaveBeenStashed = false
	try {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Squashing...' }, async () => {
			const fileStatusText = await Git.run(workspace.uri, 'status', '--short')
			const fileStatusList = trimEnd(fileStatusText).split('\n')
				.map(line => ({ path: line.substring(3), staged: /\w/.test(line.charAt(0)) }))

			const filesHaveBeenPartiallyStaged = fileStatusList.some(file => file.staged) && !fileStatusList.every(file => file.staged)
			await Git.run(workspace.uri, 'checkout', '--detach', 'HEAD')
			await Git.run(workspace.uri, 'commit', '--no-verify', filesHaveBeenPartiallyStaged ? '' : '--all', '--message=(squash commit)')
			const squashCommitHash = await Git.getCurrentCommitHash(workspace.uri)

			if (filesHaveBeenPartiallyStaged) {
				await Git.run(workspace.uri, 'stash', 'push', '--include-untracked')
				filesHaveBeenStashed = true
			}

			await Git.run(workspace.uri, 'reset', '--hard', select.commitHash)
			await Git.run(workspace.uri, 'cherry-pick', '--no-commit', squashCommitHash)
			await Git.run(workspace.uri, 'commit', '--amend', '--reset-author', '--reuse-message=' + select.commitHash)

			const commitHashText = await Git.run(workspace.uri, 'log', '--pretty=format:%H', select.commitHash + '..' + originalCommitHash)
			const commitHashList = compact(commitHashText.split('\n'))
			for (const commitHash of commitHashList) {
				const result = await Git.run(workspace.uri, 'cherry-pick', commitHash)
				if (last(result.trim().split('\n')).startsWith('Otherwise,')) {
					await Git.run(workspace.uri, 'cherry-pick', '--abort')
					throw `Could not be able to cherry pick ${commitHash}.`
				}
			}

			if (status.local) {
				await Git.run(workspace.uri, 'branch', status.remote ? `--set-upstream-to=${status.remote}` : '', '--force', status.local)
				await Git.run(workspace.uri, 'checkout', status.local)
			}
		})

		track('squash', { success: true })

	} catch (ex) {
		track('squash', { success: false })

		await Git.run(workspace.uri, 'reset', '--hard', originalCommitHash)

		if (status.local) {
			await Git.run(workspace.uri, 'checkout', status.local)
		}

	} finally {
		if (filesHaveBeenStashed) {
			await Git.run(workspace.uri, 'stash', 'pop')
		}
	}

	await vscode.commands.executeCommand('git.refresh')
}
