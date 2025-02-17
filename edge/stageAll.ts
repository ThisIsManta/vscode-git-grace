import * as vscode from 'vscode'

import Telemetry from './Telemetry'

export default async function stageAll() {
	await vscode.commands.executeCommand('workbench.view.scm')
	await vscode.commands.executeCommand('git.stageAll')

	Telemetry.logUsage('stage-all')
}
