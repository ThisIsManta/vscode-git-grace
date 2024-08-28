import * as vscode from 'vscode'
import { track } from './Telemetry'

export default async function () {
	track('delete-branch')

	await vscode.commands.executeCommand('git.deleteBranch')
}
