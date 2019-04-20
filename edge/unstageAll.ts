import * as vscode from 'vscode'

export default async function unstageAll() {
	await vscode.commands.executeCommand('git.unstageAll')
}
