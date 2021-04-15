import * as vscode from 'vscode'

export default async function stageAll() {
	await vscode.commands.executeCommand('workbench.view.scm')
	await vscode.commands.executeCommand('git.stageAll')
}
