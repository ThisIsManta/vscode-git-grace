# Git Grace

**Git Grace** is a Visual Studio Code extension that provides handy and persistent Git commands.

## Introductory

The problems with Visual Studio Code built-in Git commands is:
1. Error messages are hidden in the Git output channel.
2. Progress bar is hidden in the SCM panel.
3. Retrying **fetch** and **pull** should be done automatically.
4. Commands are executed asynchronously. You have to wait the current command to be done before calling another command.

For example, if you fails running **fetch** for whatever reasons, it does not does not show any error feedback, unless you open its Git output channel manually. And it should retry the operation automatically for user's convenience since it is safe to do so.

Here are the solutions to the problems above:
1. Error messages are shown at the top with _Show Log_ button to open **Git Grace** output channel (do not confuse this with the built-in **Git** output channel.)
2. Progress is shown at the status bar.
3. Retrying **fetch** and **pull** will be done twice.
4. Queuing system ensures commands will be executed in sequence. You can call another command without waiting for the current command to be finished.

## Basic usage

As soon as **Git Grace** is installed, the extension provides the following commands and keybindings:

- **Fetch (Persistent)** (`gitGrace.fetch`) – does fetch from _origin_ with `--prune`. You will be asked if you want to fast forward when the current local branch is behind its remote branch.
- **Pull (Persistent)** (`gitGrace.pull`) – does fetch from _origin_ with `--prune` then rebase normally.
- **Push (Persistent)** (`gitGrace.push`) – does push to _origin_ with `--tags`. You will be asked if you want to force pushing when the current local branch and its remote branch are out-of-sync.
- **Commit (Amend)** (`gitGrace.commitAmend`) – is similar to `git.undoCommit` but prompts a confirmation dialog beforehand.
- **Commit Empty** (`gitGrace.commitEmpty`) – does commit with `--allow-empty` and the message of `(empty commit)`.
- **Stash (Unnamed, Include Untracked)** (`gitGrace.stash`) – does unnamed stash with `--include-untracked`.
- **Checkout to "origin/master"** (`gitGrace.master`) – does checkout _origin/master_ without creating a branch. You will be asked if you want to stash or discard the dirty files beforehand.
- **Open on Web...** (`gitGrace.openWeb`) – does populate the link to the repository and the current active file so you can open them in your web browser.
- **Create Pull-Request...** (`gitGrace.pullRequest`) – does push and open the link to GitHub pull-request creation page in your web browser, which is something like _http://github.com/user/repository/compare/master...branch_.
- **Sync (Gracefully)** (`gitGrace.sync`) – does push to _origin_ then pulls with `-all`, `--rebase` and finally pushes everything to _origin_. You will be asked to commit beforehand if the repository is dirty.
- **Delete Merged Branches...** (`gitGrace.deleteMergedBranches`) – does search and deletes all the merged branches. You will be asked if you want to proceed once all the merged branches have been counted.


In addition to Git commands above, **Git Grace** also provides **TortoiseGit** integration. The select commands are copied from [Marko Binic's **TortoiseGit Commands**](https://marketplace.visualstudio.com/items?itemName=mbinic.tgit-cmds) extension.

- **Show Log...** (`tortoiseGit.showLog`) – show the log messages for the whole repository.
- **Show File Log...** (`tortoiseGit.showFileLog`) – show the log messages for the current active file.
- **Commit...** (`tortoiseGit.commit`) – open **TortoiseGit** commit dialog.
- **Blame...** (`tortoiseGit.blame`) – open **TortoiseGitBlame** for the current active file.

By default, the path to **TortoiseGit** executable is `C:\Program Files\TortoiseGit\bin\TortoiseGitProc.exe`, but it can be changed later at `gitGrace.tortoiseGitPath` setting.