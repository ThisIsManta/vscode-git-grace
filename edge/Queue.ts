import * as _ from 'lodash'
import * as vscode from 'vscode'

import * as Shared from './shared'

const pendingActionList: Array<{ action: (options?) => Promise<any>, options?}> = []

export function put(action: (options?: object) => Promise<any>) {
	return async (options = {}) => {
		try {
			if (_.isEqual(pendingActionList[0], { action, options })) {
				return undefined
			}

			pendingActionList.unshift({ action, options })

			if (pendingActionList.length === 1) {
				await action(options)
				pendingActionList.pop()

				while (pendingActionList.length > 0) {
					const { action: nextAction, options } = _.last(pendingActionList)
					await nextAction(options)
					pendingActionList.pop()
				}
			}

		} catch (error) {
			clear()

			const message = error instanceof Error ? error.message : String(error)
			if (await vscode.window.showErrorMessage(message, { modal: true }, 'Show Log') === 'Show Log') {
				Shared.getOutputChannel().show()
			}
		}
	}
}

export function run(action: (options?: object) => Promise<any>) {
	return put(action)()
}

export function clear() {
	pendingActionList.splice(0, pendingActionList.length)
}