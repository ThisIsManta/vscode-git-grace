import debounce from 'lodash/debounce'
import * as os from 'os'
import * as vscode from 'vscode'

const version = vscode.extensions.getExtension('thisismanta.git-grace').packageJSON.version

const events: Array<object> = []

export function track(eventName: string, eventData?: object) {
	events.push({
		device_id: vscode.env.machineId,
		event_type: eventName,
		event_properties: eventData,
		app_version: version,
		os_name: os.platform(),
		language: vscode.env.language,
	})

	trackInternal()
}

const trackInternal = debounce(() => {
	// Disable Amplitude as it does not accept my events anymore
	/* const params = new URLSearchParams()
	params.append('api_key', 'df3ebf85734dba90b618ecb5f99aa07f')
	params.append('event', JSON.stringify(events))

	// See https://analytics.amplitude.com/manta-vsce/settings/projects/222390
	fetch('https://api.amplitude.com/httpapi', {
		method: 'post',
		body: params,
	}).catch(ex => {
		console.error('Error sending Amplitude tracking: ', ex)
	}) */

	events.splice(0, events.length)
}, 30000)
