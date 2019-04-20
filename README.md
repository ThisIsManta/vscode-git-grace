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

|Keybinding|Command|Description|
|---|---|---|
|_alt+g f_|`gitGrace.fetch`|Fetch from _origin_ with _--prune_. You will be asked if you want to fast forward/push/rebase/merge when the current local branch and its remote counterpart are out of sync.|
|_alt+g u_|`gitGrace.pull`|Fetch from _origin_ with _--prune_ then rebase normally.|
|_alt+g p_|`gitGrace.push`|Push to _origin_ with _--tags_. You will be asked if _--force-with-lease_ is needed when the current local branch and its remote counterpart are out of sync.|
|_alt+g d_|`git.openChange`|Open the diff window for the active file.|
|_alt+g y_|`gitGrace.stageAll`|Add files to the stage.|
|_alt+g z_|`gitGrace.unstageAll`|Remove added files from the stage.|
|_alt+g r_|`gitGrace.cleanAll`|Revert dirty files.|
|_alt+g c_|`gitGrace.commitSmart`|Open **Visual Studio Code** built-in **Git** source control panel and prompt last 500 commit messages that were written by the current user.|
|_alt+g a_|`gitGrace.commitAmend`|Similar to `git.undoCommit` but prompt a confirmation dialog beforehand.|
|_alt+g e_|`gitGrace.commitEmpty`|Commit with _--allow-empty_ and the message of _"(empty commit)"_.|
|_alt+g q_|`gitGrace.squash`|Modify the selected commit in the current path with the current staged files. There is a chance of conflicts; use at your own risk.|
|_alt+g n_|`gitGrace.branch`|Create a new branch at the current commit, or rename the current non-master local branch. You will be asked to type a branch name.|
|_alt+g s_|`gitGrace.checkout`|Checkout an existing branch while fetching the remote branches in the background. You will be asked if you want to stash/discard the dirty files and discard the dangling commits beforehand.|
|_alt+g m_|`gitGrace.master`|Checkout the commit at _origin/master_ without creating a branch (detached head). You will be asked if you want to stash/discard the dirty files and discard the dangling commits beforehand.|
|_alt+g h_|`gitGrace.openWeb`|Open the link to the active file in your web browser.|
|_alt+g j_|`gitGrace.pullRequest`|Push and open the link to GitHub pull-request creation page in your web browser, which is something like _http://github.com/user/repository/compare/master...branch_.|
|_alt+g g_|`gitGrace.sync`|Push to _origin_ then pull with _--all_, _--rebase_ and finally pushes everything to _origin_. You will be asked to commit beforehand if the repository is dirty.|
|_alt+g o_|`gitGrace.showOutput`|Open the output channel for **Git Grace** extension.|
||`gitGrace.urgent`|Commit all files with the message of _"(work-in-progress)"_, create _WIP_ tag, and push only the tag. This command is useful when you want to leave your computer and continue where you left off on another computer.|
||`gitGrace.urgentRestore`|Checkout and delete WIP tag that corresponding to the current local branch.|
|_alt+g l_|`tortoiseGit.showLog`|Show the log messages for the whole repository.|
|_alt+g k_|`tortoiseGit.showFileLog`|Show the log messages for the current active file.|
|_alt+g v_|`tortoiseGit.commit`|Commit with **TortoiseGit**.|
|_alt+g b_|`tortoiseGit.blame`|Open **TortoiseGitBlame** for the current active file.|
|_alt+s s_|`gitGrace.stash`|Save an unnamed stash with _--include-untracked_.|
|_alt+s p_|`gitGrace.stashPopLatest`|Restore the last stash without hassle.|
|_alt+s l_|`gitGrace.stashPop`|Open the stash list and restore the selected stash.|
|_alt+s c_|`gitGrace.stashClear`|Clear the stash list.|
|_alt+s x_|`gitGrace.deleteBranch`|Similar to `git.deleteBranch`.|
||`gitGrace.deleteMergedBranches`|Delete all the branches that have been merged to _origin/master_. This command is available in the command palette as _Delete Merged Branches_.|

**TortoiseGit** integration (Windows exclusive) is slightly modified from [Marko Binic's **TortoiseGit Commands**](https://marketplace.visualstudio.com/items?itemName=mbinic.tgit-cmds) extension. By default, the path to **TortoiseGit** executable is `C:\Program Files\TortoiseGit\bin\TortoiseGitProc.exe`, but it can be changed later at `gitGrace.tortoiseGitPath` setting.
