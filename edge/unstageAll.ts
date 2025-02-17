import * as vscode from 'vscode'

import Telemetry from './Telemetry'

export default async function unstageAll() {
	await vscode.commands.executeCommand('workbench.view.scm')
	await vscode.commands.executeCommand('git.unstageAll')

	Telemetry.logUsage('unstage-all')
}
