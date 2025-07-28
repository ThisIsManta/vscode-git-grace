import * as vscode from 'vscode'

import * as Git from './Git'
import Telemetry from './Telemetry'
import * as Util from './Utility'

export default async function () {
	const workspaceList = Util.getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		return
	}

	const output = {
		updated: false,
		forced: false,
	}

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Window,
			title: 'Pushing...',
		},
		async (progress) => {
			for (const workspace of workspaceList) {
				if (workspaceList.length > 1) {
					progress.report({ message: `Pushing "${workspace.name}"...` })
				}

				const { updated, forced } = await pushInternal(workspace)
				output.updated = output.updated || updated
				output.forced = output.forced || forced
			}
		},
	)

	Telemetry.logUsage('push', { forced: output.forced })
}

export async function pushInternal(
	workspace: vscode.WorkspaceFolder,
	options?: {
		token?: vscode.CancellationToken
	},
): Promise<{
	updated: boolean
	forced: boolean
}> {
	await Util.saveAllFilesOnlyIfAutoSaveIsOn()

	const status = await Git.getCurrentBranchStatus(workspace.uri)
	if (status.local === '') {
		throw new Error(`Workspace "${workspace.name}" was not on any branch.`)
	}

	if (options?.token?.isCancellationRequested) {
		throw new vscode.CancellationError()
	}

	let forced = false
	if (
		status.remote &&
		status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote
	) {
		const select = await vscode.window.showWarningMessage(
			`The local branch "${status.local}" could not be pushed because it was out of sync with its remote branch.`,
			{ modal: true },
			'Force Pushing',
		)

		if (!select) {
			throw new vscode.CancellationError()
		}

		forced = true
	}

	let updated = false

	try {
		const result = await Git.run(
			workspace.uri,
			'push',
			status.sync === Git.SyncStatus.LocalIsNotInSyncWithRemote
				? '--force-with-lease'
				: '',
			'origin',
			status.local,
		)
		if (options?.token?.isCancellationRequested) {
			throw new vscode.CancellationError()
		}

		if (result.trim() !== 'Everything up-to-date') {
			updated = true
		}
	} catch (error) {
		if (error instanceof Error) {
			Telemetry.logError(error)
		}

		if (options?.token?.isCancellationRequested) {
			throw new vscode.CancellationError()
		}

		Util.setWorkspaceAsFirstTryNextTime(workspace)

		if (
			error instanceof Git.GitCommandLineError &&
			error.message.includes('error: failed to push some refs')
		) {
			if (
				error.message.includes('error: GH006: Protected branch update failed')
			) {
				throw new Error(
					`Pushing failed because the remote branch "${status.remote || status.local}" is protected.`,
				)
			}

			await Git.run(workspace.uri, 'fetch', 'origin', status.local, {
				token: options?.token,
			})

			if (options?.token?.isCancellationRequested) {
				throw new vscode.CancellationError()
			}

			throw new Error(
				`Pushing failed because the remote branch "${status.remote || status.local}" has been moved.`,
			)
		}

		throw new Error('Pushing failed.')
	}

	await vscode.commands.executeCommand('git.refresh')

	if (updated) {
		vscode.window.setStatusBarMessage('Pushing completed', 10000)
	} else {
		vscode.window.setStatusBarMessage('No updates', 10000)
	}

	return {
		updated,
		forced,
	}
}
