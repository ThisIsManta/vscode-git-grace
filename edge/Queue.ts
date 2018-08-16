import * as _ from 'lodash'
import * as vscode from 'vscode'

import Log from './Log'

type Action = (options?: object) => Promise<any>

const pendingActionList: Array<{ action: Action, options: object }> = []

let cancellationService: vscode.CancellationTokenSource

export function put(action: Action, bypassActionList?: Array<Action>) {
	return async (options: object = {}) => {
		try {
			// Do not enqueue the same operation
			if (_.isEqual(pendingActionList[0], { action, options })) {
				return undefined
			}

			// Cancel the active operation if the new pending operation requests cancellation
			if (pendingActionList.length > 0 && _.includes(bypassActionList, _.last(pendingActionList).action)) {
				if (cancellationService) {
					cancellationService.cancel()
					cancellationService = null
				}
				pendingActionList.pop()

				while (pendingActionList.length > 0 && _.includes(bypassActionList, _.last(pendingActionList).action)) {
					pendingActionList.pop()
				}
			}

			pendingActionList.unshift({ action, options })

			if (pendingActionList.length === 1) {
				cancellationService = new vscode.CancellationTokenSource()
				await action({ ...options, token: cancellationService.token })
				pendingActionList.pop()

				while (pendingActionList.length > 0) {
					cancellationService = new vscode.CancellationTokenSource()
					const { action, options } = _.last(pendingActionList)
					await action({ ...options, token: cancellationService.token })
					pendingActionList.pop()
				}

				cancellationService = null
			}

		} catch (ex) {
			clear()

			const message = ex instanceof Error ? ex.message : String(ex)
			if (await vscode.window.showErrorMessage(message, { modal: true }, 'Show Log') === 'Show Log') {
				Log.show()
			}
		}
	}
}

export function run(action: (options?: object) => Promise<any>) {
	return put(action)()
}

export function clear() {
	pendingActionList.splice(0, pendingActionList.length)
	cancellationService = null
}