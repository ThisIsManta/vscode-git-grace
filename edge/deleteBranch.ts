import * as vscode from 'vscode'

import Telemetry from './Telemetry'

export default async function () {
	await vscode.commands.executeCommand('git.deleteBranch')

	Telemetry.logUsage('delete-branch')
}
