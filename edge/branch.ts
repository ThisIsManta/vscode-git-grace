import * as vscode from 'vscode'

import * as Git from './Git'
import Telemetry from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.SourceControl },
		async () => {
			const status = await Git.getCurrentBranchStatus(workspace.uri)
			if (status.local === '' || status.local === 'master') {
				await tryCreateNewBranch(workspace.uri)
			} else {
				const options: Array<vscode.MessageItem> = [
					{ title: 'Create New Branch' },
					{ title: 'Rename Current Branch' },
				]
				const select = await vscode.window.showWarningMessage(
					`You are on the local branch "${status.local}".`,
					{ modal: true },
					...options,
				)

				if (select === options[0]) {
					await tryCreateNewBranch(workspace.uri)

					Telemetry.logUsage('branch:new')
				} else if (select === options[1]) {
					await vscode.commands.executeCommand('git.renameBranch')

					Telemetry.logUsage('branch:rename')

					const oldStatus = status
					if (oldStatus.remote) {
						const newStatus = await Git.getCurrentBranchStatus(workspace.uri)
						await Git.run(
							workspace.uri,
							'branch',
							'--unset-upstream',
							newStatus.local,
						)

						await vscode.window.withProgress(
							{
								location: vscode.ProgressLocation.Window,
								title: 'Syncing Remote Branch...',
							},
							async () => {
								await Git.run(
									workspace.uri,
									'push',
									'--delete',
									'origin',
									oldStatus.local,
									{ retry: 1 },
								)
								await Git.run(
									workspace.uri,
									'push',
									'origin',
									newStatus.local,
									{ retry: 1 },
								)
							},
						)
					}
				}
			}
		},
	)
}

async function tryCreateNewBranch(link: vscode.Uri) {
	const localBranches = await Git.getLocalBranches(link)
	const remoteBranches = await Git.getRemoteBranches(link)
	const existingBranchNames = new Set<string>([
		...localBranches.map(({ name }) => name),
		...remoteBranches.map(({ name }) => name.replace(/^origin\//, '')),
	])

	const branchName = await vscode.window.showInputBox({
		placeHolder: 'Enter a new branch name',
		ignoreFocusOut: true,
		validateInput: async (value: string) => {
			if (existingBranchNames.has(value)) {
				return 'The given branch name already exists.'
			}

			try {
				await Git.run(link, 'check-ref-format', '--branch', value)

				return null
			} catch (error) {
				return 'The given branch name is not valid.'
			}
		},
	})

	if (!branchName) {
		return
	}

	await Git.run(link, 'checkout', '-B', branchName)

	vscode.commands.executeCommand('git.refresh')
}
