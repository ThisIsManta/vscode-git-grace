import * as cp from 'child_process'
import { setTimeout } from 'timers/promises'
import { promisify } from 'util'

import * as Git from './Git'
import Telemetry from './Telemetry'
import * as Util from './Utility'

const exec = promisify(cp.exec)
export async function showLog() {
	const folderPath = await Util.getCurrentWorkspace()
	if (!folderPath) {
		return
	}

	await exec('fork log', { cwd: Git.getRepositoryLink(folderPath.uri)?.fsPath })

	Telemetry.logUsage('fork:show-log')
}

export async function showFileLog() {
	if (!Util.getCurrentFile()) {
		return
	}

	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	const cwd = Git.getRepositoryLink(workspace.uri)?.fsPath

	// Fix the issue where Fork does not open the file history when cold start
	// See https://github.com/fork-dev/Tracker/issues/2023
	await exec('fork log', { cwd })
	await setTimeout(500)

	await exec(`fork log -- "${Util.getCurrentFile().fsPath}"`, { cwd })

	Telemetry.logUsage('fork:show-file-log')
}

export async function commit() {
	const workspace = await Util.getCurrentWorkspace()
	if (!workspace) {
		return
	}

	await exec('fork commit', {
		cwd: Git.getRepositoryLink(workspace.uri)?.fsPath,
	})

	Telemetry.logUsage('fork:commit')
}
