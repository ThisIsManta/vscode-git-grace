import * as cp from 'child_process'
import { setTimeout } from 'timers/promises'
import { promisify } from 'util'

import * as Git from './Git'
import * as Util from './Utility'

const exec = promisify(cp.exec)
export async function showLog() {
	const folderPath = await Util.getCurrentWorkspace()
	if (!folderPath) {
		return
	}

	exec('fork log', { cwd: Git.getRepositoryLink(folderPath.uri)?.fsPath })
}

export async function showFileLog() {
	if (!Util.getCurrentFile()) {
		return
	}

	const folderPath = await Util.getCurrentWorkspace()
	if (!folderPath) {
		return
	}

	// Fix the issue where Fork does not open the file history when cold start
	// See https://github.com/fork-dev/Tracker/issues/2023
	if ((await getForkWindowCount()) === 0) {
		await exec('fork', { cwd: Git.getRepositoryLink(folderPath.uri)?.fsPath })

		while ((await getForkWindowCount()) === 0) {
			await setTimeout(100)
		}
	}

	exec(`fork log -- "${Util.getCurrentFile().fsPath}"`, { cwd: Git.getRepositoryLink(folderPath.uri)?.fsPath })
}

async function getForkWindowCount() {
	return Number((await exec('osascript -e \'tell application "System Events" to count windows of process "Fork"\'')).stdout)
}

export async function commit() {
	const folderPath = await Util.getCurrentWorkspace()
	if (!folderPath) {
		return
	}

	exec('fork commit', { cwd: Git.getRepositoryLink(folderPath.uri)?.fsPath })
}
