import * as vscode from 'vscode'

export default async function unstageAll() {
	await vscode.commands.executeCommand('workbench.view.scm')
	await vscode.commands.executeCommand('git.unstageAll')
}
