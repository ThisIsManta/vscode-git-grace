**Git Grace**, unlike any other Git companions, provides persistence and safety checks on Git operations, for example,
- Operations are queued so you can call another command without waiting for the current command to be finished.
- Progress is shown at the status bar or as notifications so you know what is going on.
- Prompts are added before running destructive commands such as checking out another branch while having a dangling commit on the current branch.

## Basic usage

As soon as **Git Grace** is installed, the extension provides the following commands and keybindings:

|Command/<br>Keybinding|Description|
|---|---|
|`gitGrace.fetch`<br>(Alt+G F)|Fetch from _origin_ with _--prune_. You will be asked if you want to fast forward/push/rebase/merge when the current local branch and its remote counterpart are out of sync.|
|`gitGrace.checkout`<br>(Alt+G S)|Checkout an existing branch while fetching the remote branches in the background, and create the local counterpart branch. You will be asked if you want to stash/discard the dirty files and discard the dangling commits beforehand.|
|`gitGrace.branch`<br>(Alt+G N)|Create a new branch at the current commit, or rename the current non-master local branch. You will be asked to type a branch name.|
|`gitGrace.master`<br>(Alt+G M)|Checkout the commit at _origin/HEAD_ without creating a branch (detached head). You will be asked if you want to stash/discard the dirty files and discard the dangling commits beforehand.|
|`gitGrace.pull`<br>(ALT+G U)|Fetch from _origin_ with _--prune_ then rebase normally.|
|`gitGrace.push`<br>(Alt+G P)|Push to _origin_. You will be asked if _--force-with-lease_ is needed when the current local branch and its remote counterpart are out of sync.|
|`gitGrace.commitSmart`<br>(Alt+G C)|Prompt for a commit message with last 500 historical messages suggested and create a commit using **Visual Studio Code** built-in **Git** source control panel.|
|`gitGrace.commitAmend`<br>(Alt+G A)|Similar to `git.undoCommit` but prompt a confirmation dialog beforehand.|
|`gitGrace.commitEmpty`<br>(Alt+G E)|Commit with _--allow-empty_ and the message of _"(empty commit)"_.|
|`gitGrace.stageAll`<br>(Alt+G Y)|Add files to the stage.|
|`gitGrace.unstageAll`<br>(Alt+G Z)|Remove added files from the stage.|
|`gitGrace.cleanAll`<br>(Alt+G R)|Revert dirty files.|
|`gitGrace.deleteBranch`<br>(Alt+G X)|Similar to `git.deleteBranch`.|
|`gitGrace.deleteMergedBranches`|Delete all the branches that have been merged to _origin/HEAD_. This command is available in the command palette as _Delete Merged Branches_.|
|`gitGrace.squash`<br>(Alt+G Q)|Modify the selected commit in the current path with the current staged files. There is a chance of conflicts; use at your own risk.|
|`gitGrace.sync`<br>(Alt+G G)|Push to _origin_ then pull with _--all_, _--rebase_ and finally pushes everything to _origin_. You will be asked to commit beforehand if the repository is dirty.|
|`gitGrace.pullRequest`<br>(Alt+G J)|Push and open GitHub pull-request creation page.|
|`gitGrace.openWeb`<br>(Alt+G H)|Open the current active file in GitHub.|
|`gitGrace.blame`<br>(Alt+G B)|Open the current active file in GitHub blame page.|
|`gitGrace.showOutput`<br>(Alt+G O)|Open the output channel for **Git Grace** extension.|
|`gitGrace.stash`<br>(Alt+S S)|Save an unnamed stash with _--include-untracked_.|
|`gitGrace.stashPopLatest`<br>(Alt+S P)|Restore the last stash without hassle.|
|`gitGrace.stashPop`<br>(Alt+S L)|Open the stash list and restore the selected stash.|
|`gitGrace.stashClear`<br>(Alt+S C)|Clear the stash list.|
|`git.openChange`<br>(Alt+G D)|Open the diff window for the active file.|

## TortoiseGit integration

Modified from [Marko Binic's TortoiseGit Commands](https://marketplace.visualstudio.com/items?itemName=mbinic.tgit-cmds), [**TortoiseGit**](https://tortoisegit.org/) integration will search for `TortoiseGitProc.exe` automatically.

|Command|Description|
|---|---|
|`tortoiseGit.showLog`|Show history for the current repository.|
|`tortoiseGit.showFileLog`|Show history for the current active file.|
|`tortoiseGit.commit`|Open **TortoiseGit** commit dialog for the current repository.|
|`tortoiseGit.blame`|Open **TortoiseGit** blame dialog for the current active file.|
