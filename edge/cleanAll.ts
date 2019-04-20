import * as vscode from 'vscode'

export default async function cleanAll() {
	await vscode.commands.executeCommand('git.cleanAll')
}