import isEqual from 'lodash/isEqual'
import * as vscode from 'vscode'

import Log from './Log'

type Action = (options?: { token: vscode.CancellationToken }) => Promise<any>

const pendingActionList: Array<{
	action: Action
	options: object
}> = []

let cancellationService: vscode.CancellationTokenSource | null = null
export function put(action: Action, cancellableActionList?: Array<Action>) {
	return async (options: object = {}): Promise<void> => {
		try {
			// Do not enqueue the same operation
			if (
				isEqual(pendingActionList[0], {
					action,
					options,
				})
			) {
				return
			}

			// Cancel the active operation if the new pending operation requests cancellation
			if (
				pendingActionList.length > 0 &&
				cancellableActionList &&
				cancellableActionList.includes(pendingActionList.at(-1)!.action)
			) {
				if (cancellationService) {
					cancellationService.cancel()
					cancellationService = null
				}

				pendingActionList.pop()

				while (
					pendingActionList.length > 0 &&
					cancellableActionList.includes(pendingActionList.at(-1)!.action)
				) {
					pendingActionList.pop()
				}
			}

			pendingActionList.unshift({
				action,
				options,
			})

			if (pendingActionList.length === 1) {
				cancellationService = new vscode.CancellationTokenSource()
				await action({
					...options,
					token: cancellationService.token,
				})
				pendingActionList.pop()

				while (pendingActionList.length > 0) {
					cancellationService = new vscode.CancellationTokenSource()

					const { action, options } = pendingActionList.at(-1)!
					await action({
						...options,
						token: cancellationService.token,
					})
					pendingActionList.pop()
				}

				cancellationService = null
			}
		} catch (error) {
			clear()

			if (!error || error instanceof vscode.CancellationError) {
				return
			}

			const message = ((): string => {
				if (error instanceof Error) {
					return error.message
				}

				if (
					typeof error === 'object' &&
					'message' in error &&
					typeof error.message === 'string'
				) {
					return error.message
				}

				return String(error)
			})()

			if (
				(await vscode.window.showErrorMessage(
					message,
					{ modal: true },
					'Show Log',
				)) === 'Show Log'
			) {
				Log.show()
			}
		}
	}
}

export function run(
	action: (options?: { token: vscode.CancellationToken }) => Promise<any>,
) {
	return put(action)()
}

export function clear() {
	pendingActionList.splice(0, pendingActionList.length)
	cancellationService = null
}
