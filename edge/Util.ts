import * as _ from 'lodash'
import * as fp from 'path'
import * as vscode from 'vscode'

import * as Git from './Git'

let workspaceList: Array<vscode.WorkspaceFolder> = null

export function getWorkspaceListWithGitEnabled() {
	if (workspaceList === null && vscode.workspace.workspaceFolders) {
		workspaceList = vscode.workspace.workspaceFolders.filter(item => !!Git.getRepositoryLink(item.uri))
	}
	return workspaceList || []
}

export function setWorkspaceAsFirstTryNextTime(workspace: vscode.WorkspaceFolder) {
	getWorkspaceListWithGitEnabled()

	workspaceList = _.sortBy(workspaceList, item => item === workspace ? 0 : 1)
}

export async function updateWorkspaceList(e: vscode.WorkspaceFoldersChangeEvent) {
	getWorkspaceListWithGitEnabled()

	workspaceList.push(...e.added.filter(item => !!Git.getRepositoryLink(item.uri)))
	_.pull(workspaceList, ...e.removed)
}

export async function getCurrentWorkspace() {
	const workspaceList = getWorkspaceListWithGitEnabled()
	if (workspaceList.length === 0) {
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage(`There were no folders opened.`, { modal: true })
			return null

		} else {
			vscode.window.showErrorMessage(`The current folder was not in Git repository.`, { modal: true })
			return null
		}
	}

	if (vscode.workspace.workspaceFolders.length === 1 && workspaceList.length === 1) {
		return workspaceList[0]
	}

	if (vscode.window.activeTextEditor) {
		const currentWorkspace = workspaceList.find(item => item.uri.fsPath === vscode.window.activeTextEditor.document.uri.fsPath)
		if (currentWorkspace) {
			return currentWorkspace
		}
	}

	const select = await vscode.window.showQuickPick(
		workspaceList.map(item => item.name),
		{ placeHolder: 'Select a workspace' }
	)
	if (!select) {
		return null
	}

	return workspaceList.find(item => select === item.name)
}

export function saveAllFilesOnlyIfAutoSaveIsOn() {
	const autoSave = vscode.workspace.getConfiguration('files').get<string>('autoSave')
	if (autoSave === 'afterDelay' || autoSave === 'onFocusChange') {
		return vscode.workspace.saveAll(false)
	}
}

export function getCurrentFile() {
	if (!vscode.window.activeTextEditor) {
		vscode.window.showErrorMessage(`There were no files opened.`, { modal: true })
		return null
	}

	if (Git.getRepositoryLink(vscode.window.activeTextEditor.document.uri) === null) {
		vscode.window.showErrorMessage(`The current file was not in Git repository.`, { modal: true })
		return null
	}

	return vscode.window.activeTextEditor.document.uri
}

export async function getCurrentFileBeforeRenamed() {
	const currentFile = getCurrentFile()
	const repositoryLink = Git.getRepositoryLink(currentFile)
	const relativeCurrentFilePath = _.trim(currentFile.fsPath.substring(repositoryLink.fsPath.length).replace(/\\/g, '/'), '/')

	let fileStatusList = await Git.getFileStatus(repositoryLink)

	if (fileStatusList.some(file => file.status === '??' && file.currentPath === relativeCurrentFilePath)) {
		await Git.run(repositoryLink, 'add', relativeCurrentFilePath)
		fileStatusList = await Git.getFileStatus(repositoryLink)
	}

	const renamedFile = fileStatusList.find(file => file.status === 'R' && file.currentPath === relativeCurrentFilePath)
	if (renamedFile) {
		return vscode.Uri.file(fp.join(repositoryLink.fsPath, renamedFile.originalPath.replace(/\//g, fp.sep)))
	}

	return null
}
