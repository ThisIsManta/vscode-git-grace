const fs = require('fs')
const fp = require('path')

async function downloadGitBuiltInExtensionDefinition() {
	const vscodeVersion = require('../package.json').engines.vscode.replace(/^\^/, '')

	const response = await fetch(`https://raw.githubusercontent.com/Microsoft/vscode/${vscodeVersion}/extensions/git/src/api/git.d.ts`)
	if (response.status !== 200) {
		throw new Error('Could not download the type definition of VSCode\'s Git built-in extension.')
	}

	const textContent = '/* eslint-disable */\n\n' + await response.text()
	fs.writeFileSync(fp.join(__dirname, 'GitBuiltInExtension.d.ts'), textContent, 'utf-8')
}

downloadGitBuiltInExtensionDefinition()
