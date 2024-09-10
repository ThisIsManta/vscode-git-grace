import pull from 'lodash/pull'
import sortBy from 'lodash/sortBy'
import * as vscode from 'vscode'

import * as Git from './Git'

let workspaceList: Array<vscode.WorkspaceFolder> | null = null
export function getWorkspaceListWithGitEnabled() {
	if (workspaceList === null && vscode.workspace.workspaceFolders) {
		workspaceList = vscode.workspace.workspaceFolders.filter(item => !!Git.getRepositoryLink(item.uri))
	}

	return workspaceList || []
}

export function setWorkspaceAsFirstTryNextTime(workspace: vscode.WorkspaceFolder) {
	getWorkspaceListWithGitEnabled()

	workspaceList = sortBy(workspaceList, item => (item === workspace ? 0 : 1))
}

export async function updateWorkspaceList(e: vscode.WorkspaceFoldersChangeEvent) {
	getWorkspaceListWithGitEnabled()

	if (!workspaceList) {
		workspaceList = []
	}

	workspaceList.push(...e.added.filter(item => !!Git.getRepositoryLink(item.uri)))
	pull(workspaceList, ...e.removed)
}

export async function getCurrentWorkspace(): Promise<vscode.WorkspaceFolder | null> {
	const workspaceList = getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage('There were no folders opened.', { modal: true })

			return null
		}

		vscode.window.showErrorMessage('The current folder was not in Git repository.', { modal: true })

		return null
	}

	if (vscode.workspace.workspaceFolders?.length === 1 && workspaceList.length === 1) {
		return workspaceList[0]
	}

	if (vscode.window.activeTextEditor) {
		const currentWorkspace = workspaceList.find(item => item.uri.fsPath === vscode.window.activeTextEditor?.document.uri.fsPath)
		if (currentWorkspace) {
			return currentWorkspace
		}
	}

	const select = await vscode.window.showQuickPick(
		workspaceList.map(item => item.name),
		{ placeHolder: 'Select a workspace' },
	)

	if (!select) {
		return null
	}

	return workspaceList.find(item => select === item.name) || null
}

export async function saveAllFilesOnlyIfAutoSaveIsOn() {
	const autoSave = vscode.workspace.getConfiguration('files').get<string>('autoSave')
	if (autoSave === 'afterDelay' || autoSave === 'onFocusChange') {
		await vscode.workspace.saveAll(false)
	}
}

export function getCurrentFile() {
	if (!vscode.window.activeTextEditor) {
		throw new Error('There were no files opened.')
	}

	if (Git.getRepositoryLink(vscode.window.activeTextEditor.document.uri) === null) {
		throw new Error('The current file was not in Git repository.')
	}

	return vscode.window.activeTextEditor.document.uri
}
