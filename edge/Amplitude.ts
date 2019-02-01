import * as _ from 'lodash'
import * as fetch from 'node-fetch'
import * as os from 'os'
import * as vscode from 'vscode'

const queue: Array<object> = []

export function track(eventName: string, eventData?: object) {
	queue.push({
		device_id: vscode.env.machineId,
		event_type: eventName,
		event_properties: eventData,
		app_version: vscode.extensions.getExtension('thisismanta.vscode-git-grace').packageJSON.version,
		os_name: os.platform(),
		language: vscode.env.language,
	})

	trackInternal()
}

const trackInternal = _.debounce(() => {
	fetch('https://api.amplitude.com/httpapi', {
		method: 'post',
		body: JSON.stringify({ event: queue }),
		headers: { 'Content-Type': 'application/json' }
	})
	queue.splice(0, queue.length)
}, 30000)
