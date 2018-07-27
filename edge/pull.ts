import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

export default async function () {
	const rootList = Shared.getRootList()
	if (rootList.length === 0) {
		return null
	}

	await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Pulling...' }, async () => {
		for (const root of rootList) {
			try {
				await Shared.retry(2, () => Shared.git(root.uri, 'fetch', '--prune', 'origin'))

				const status = await Shared.getCurrentBranchStatus(root.uri)
				if (status.local === '' || status.remote === '') {
					continue
				}

				await Shared.git(root.uri, 'rebase')

			} catch (ex) {
				Shared.setRootAsFailure(root)

				throw `Pulling failed.`
			}
		}

		vscode.window.setStatusBarMessage(`Pulling completed`, 10000)

		vscode.commands.executeCommand('git.refresh')
	})
}