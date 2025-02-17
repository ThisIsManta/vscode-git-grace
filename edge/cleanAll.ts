import * as vscode from 'vscode'

import Telemetry from './Telemetry'

export default async function cleanAll() {
	await vscode.commands.executeCommand('git.cleanAll')

	Telemetry.logUsage('clean-all')
}
