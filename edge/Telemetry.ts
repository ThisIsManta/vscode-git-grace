import { PostHog } from 'posthog-node'
import * as vscode from 'vscode'

// See https://us.posthog.com/project/129085/activity/explore
const postHog = new PostHog('phc_4Fdzy3zpEEdGN2W5OuqCRssCUuKFU2mtl7czyWyWIzD', {
	host: 'https://us.i.posthog.com',
})

export default vscode.env.createTelemetryLogger({
	sendEventData: (event, data) => {
		if (typeof data === 'object') {
			// Remove redundant entry
			delete data['common.vscodemachineid']
		}

		postHog.capture({
			distinctId: vscode.env.machineId,
			event,
			properties: data,
		})
	},

	sendErrorData(error, data) {
		postHog.captureException(error, vscode.env.machineId, data)
	},

	flush: async () => {
		await postHog.flush()
	},
})
