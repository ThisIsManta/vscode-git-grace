**Git Grace** is a Visual Studio Code extension that provides handy and persistent Git commands.

## Introductory

The problems with Visual Studio Code built-in Git commands are:
1. Error messages are hidden in the Git output channel.
2. Progress bar is hidden in the SCM panel.
3. Retrying **fetch** and **pull** should have been done automatically.
4. Commands are executed asynchronously. You have to wait until the current command has been done before calling another command.

For example, if you fails running **fetch** for whatever reasons, it does not show any error feedback, unless you open its Git output channel manually. And it should retry the operation automatically for user's convenience since it is safe to do so.

Here are the solutions to the problems above:
1. Error messages are shown in the notification area with _Show Log_ button to open **Git Grace** output channel (do not confuse this with the built-in **Git** output channel.)
2. Progress is shown at the status bar or as a notification.
3. Retrying **fetch** and **pull** will be done twice.
4. Queuing system ensures commands will be executed in sequence. You can call another command without waiting for the current command to be finished.

## Basic usage

As soon as **Git Grace** is installed, the extension provides the following keybindings and commands:

|Command/<br>Keybinding|Description|
|---|---|---|
|`gitGrace.fetch`<br>(alt+g f)|Fetch from _origin_ with _--prune_. You will be asked if you want to fast forward/push/rebase/merge when the current local branch and its remote counterpart are out of sync.|
|`gitGrace.pull`<br>(alt+g u)|Fetch from _origin_ with _--prune_ then rebase normally.|
|`gitGrace.push`<br>(alt+g p)|Push to _origin_ with _--tags_. You will be asked if _--force-with-lease_ is needed when the current local branch and its remote counterpart are out of sync.|
|`git.openChange`<br>(alt+g d)|Open the diff window for the active file.|
|`gitGrace.stageAll`<br>(alt+g y)|Add files to the stage.|
|`gitGrace.unstageAll`<br>(alt+g z)|Remove added files from the stage.|
|`gitGrace.cleanAll`<br>(alt+g r)|Revert dirty files.|
|`gitGrace.commitSmart`<br>(alt+g c)|Open **Visual Studio Code** built-in **Git** source control panel and prompt last 500 commit messages that were written by the current user.|
|`gitGrace.commitAmend`<br>(alt+g a)|Similar to `git.undoCommit` but prompt a confirmation dialog beforehand.|
|`gitGrace.commitEmpty`<br>(alt+g e)|Commit with _--allow-empty_ and the message of _"(empty commit)"_.|
|`gitGrace.squash`<br>(alt+g q)|Modify the selected commit in the current path with the current staged files. There is a chance of conflicts; use at your own risk.|
|`gitGrace.branch`<br>(alt+g n)|Create a new branch at the current commit, or rename the current non-master local branch. You will be asked to type a branch name.|
|`gitGrace.checkout`<br>(alt+g s)|Checkout an existing branch while fetching the remote branches in the background. You will be asked if you want to stash/discard the dirty files and discard the dangling commits beforehand.|
|`gitGrace.master`<br>(alt+g m)|Checkout the commit at _origin/master_ without creating a branch (detached head). You will be asked if you want to stash/discard the dirty files and discard the dangling commits beforehand.|
|`gitGrace.openWeb`<br>(alt+g h)|Open the link to the active file in your web browser.|
|`gitGrace.pullRequest`<br>(alt+g j)|Push and open GitHub pull-request creation page in your web browser.|
|`gitGrace.sync`<br>(alt+g g)|Push to _origin_ then pull with _--all_, _--rebase_ and finally pushes everything to _origin_. You will be asked to commit beforehand if the repository is dirty.|
|`gitGrace.showOutput`<br>(alt+g o)|Open the output channel for **Git Grace** extension.|
|`gitGrace.urgent`|Commit all files with the message of _"(work-in-progress)"_, create _WIP_ tag, and push only the tag. This command is useful when you want to leave your computer and continue where you left off on another computer.|
|`gitGrace.urgentRestore`|Checkout and delete WIP tag that corresponding to the current local branch.|
|`tortoiseGit.showLog`<br>(alt+g l)|Show the log messages for the whole repository.|
|`tortoiseGit.showFileLog`<br>(alt+g k)|Show the log messages for the current active file.|
|`tortoiseGit.commit`<br>(alt+g v)|Commit with **TortoiseGit**.|
|`tortoiseGit.blame`<br>(alt+g b)|Open **TortoiseGitBlame** for the current active file.|
|`gitGrace.stash`<br>(alt+s s)|Save an unnamed stash with _--include-untracked_.|
|`gitGrace.stashPopLatest`<br>(alt+s p)|Restore the last stash without hassle.|
|`gitGrace.stashPop`<br>(alt+s l)|Open the stash list and restore the selected stash.|
|`gitGrace.stashClear`<br>(alt+s c)|Clear the stash list.|
|`gitGrace.deleteBranch`<br>(alt+s x)|Similar to `git.deleteBranch`.|
|`gitGrace.deleteMergedBranches`|Delete all the branches that have been merged to _origin/master_. This command is available in the command palette as _Delete Merged Branches_.|

**TortoiseGit** integration (Windows exclusive) is slightly modified from [Marko Binic's **TortoiseGit Commands**](https://marketplace.visualstudio.com/items?itemName=mbinic.tgit-cmds) extension. By default, the path to **TortoiseGit** executable is `C:\Program Files\TortoiseGit\bin\TortoiseGitProc.exe`, but it can be changed later at `gitGrace.tortoiseGitPath` setting.
