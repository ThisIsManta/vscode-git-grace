# Git Grace

**Git Grace** is a **VS Code** extension that prodives.

## Basic usage

As soon as **Git Grace** is installed, the extension overrides the following keybindings:

- `ctrl+up` and `ctrl+down` - move cursor up/down by 3 character-containing lines. This skips empty lines and lines that contain only [non-word characters](https://www.w3schools.com/Jsref/jsref_regexp_wordchar_non.asp).

	![ctrl+up](docs/ctrl+up.gif)

- `ctrl+shift+up` - select like the built-in `editor.action.smartSelect.grow` command, but better with JavaScript/TypeScript/JSON/React files. For example, the selection makes in React `<div>...</div>` expand gradually.
- `ctrl+shift+down` - reduce the selection made by `ctrl+shift+up`.

	![ctrl+shift+up](docs/ctrl+shift+up.gif)

- `ctrl+left` and `ctrl+right` - move cursor left/right by one word. This is different from the built-in `cursorWordStartLeft` and `cursorWordEndRight` commands because this considers _camelCase_ as two words and skips non-word characters.

	![ctrl+right](docs/ctrl+right.gif)

- `ctrl+shift+left` and `ctrl+shift+right` - similar to `ctrl+left`/`ctrl+right`, but this expands the selection instead of moving the cursor.

- _(no keybindings)_ - delete the whole text on the left of the cursor.

	![shift+backspace](docs/shift+backspace.gif)
