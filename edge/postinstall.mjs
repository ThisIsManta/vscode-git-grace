import cp from 'node:child_process'
import fs from 'node:fs/promises'
import fp from 'node:path'
import satisfies from 'semver/functions/satisfies.js'

const vscodeMinimum = JSON.parse(await fs.readFile(fp.resolve(import.meta.dirname, '..', 'package.json'), 'utf-8')).engines.vscode

const vscodeType = JSON.parse(cp.execSync('npm list @types/vscode --json', { encoding: 'utf-8' })).dependencies['@types/vscode']?.version
if (!vscodeType) {
	throw new Error('Could not determine the version of @types/vscode from package.json.')
}

if (!satisfies(vscodeType, vscodeMinimum)) {
	throw new Error(`Found vscode ${vscodeMinimum} in package.json but got @types/vscode v${vscodeType} installed.`)
}

const file = await fetch(`https://raw.githubusercontent.com/Microsoft/vscode/${vscodeType}/extensions/git/src/api/git.d.ts`)
if (!file.ok) {
	throw new Error('Could not download the type definition of VSCode\'s Git built-in extension.')
}

let fileText = await file.text()
fileText = `// This file is managed by ${import.meta.filename.substring(import.meta.dirname.length + 1)}\n\n` + fileText
fileText = '/* eslint-disable */\n\n' + fileText
fileText = fileText.replace(/,\s*\bSourceControlHistoryItem\b/, '')
await fs.writeFile(fp.join(import.meta.dirname, 'GitBuiltInExtension.d.ts'), fileText, 'utf-8')
