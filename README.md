# Git Grace

**Git Grace** is a Visual Studio Code extension that provides handy and persistent Git commands.

## Introductory

The problems with Visual Studio Code built-in Git commands is:
1. Error messages are hidden in the Git output channel.
2. Progress bar is hidden in the SCM panel.
3. Retrying **fetch** and **pull** should be done automatically.

For example, if you fails running **fetch** for whatever reasons, it does not does not show any error feedback, unless you open its Git output channel manually. And it should retry the operation automatically for user's convenience since it is safe to do so.

Here are the solutions to the problems above:
1. Error messages are shown at the top with _Show Log_ button to open **Git Grace** output channel (do not confuse this with the built-in **Git** output channel.)
2. Progress is shown at the status bar.
3. Retrying **fetch** and **pull** will be done twice.

## Basic usage

As soon as **Git Grace** is installed, the extension provides the following commands and also keybindings:

- **Fetch (Persistent)** (`gitGrace.fetch`) - do something.
