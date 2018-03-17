# Git Grace

**Git Grace** is a Visual Studio Code extension that provides handy and persistent Git commands.

## Introductory

The problems with Visual Studio Code built-in Git commands are:
1. Error messages are hidden in the Git output channel.
2. Progress bar is hidden in the SCM panel.
3. Retrying **fetch** and **pull** should be done automatically.
4. Commands are executed asynchronously. You have to wait the current command to be done before calling another command.

For example, if you fails running **fetch** for whatever reasons, it does not show any error feedback, unless you open its Git output channel manually. And it should retry the operation automatically for user's convenience since it is safe to do so.

Here are the solutions to the problems above:
1. Error messages are shown at the top with _Show Log_ button to open **Git Grace** output channel (do not confuse this with the built-in **Git** output channel.)
2. Progress is shown at the status bar.
3. Retrying **fetch** and **pull** will be done twice.
4. Queuing system ensures commands will be executed in sequence. You can call another command without waiting for the current command to be finished.

## Basic usage

As soon as **Git Grace** is installed, the extension provides the following keybindings and commands:

|Keybinding|Command|Description|
|---|---|---|
|_alt+g f_|`gitGrace.fetch`|Fetch from _origin_ with _--prune_. You will be asked if you want to fast forward when the current local branch is behind its counterpart remote branch.|
|_alt+g u_|`gitGrace.pull`|Fetch from _origin_ with _--prune_ then rebase normally.|
|_alt+g p_|`gitGrace.push`|Push to _origin_ with _--tags_. You will be asked if you want to try again with _--force_ when the current local branch and its counterpart remote branch are out-of-sync.|
|_alt+g d_|`git.openChange`|Open the diff window for the active file.|
|_alt+g z_|`git.unstageAll`|Remove added files from the stage.|
|_alt+g r_|`git.cleanAll`|Revert dirty files.|
|_alt+g c_|`workbench.view.scm`|Commit with **Visual Studio Code** built-in SCM panel.|
|_alt+g a_|`gitGrace.commitAmend`|Similar to `git.undoCommit` but prompt a confirmation dialog beforehand.|
|_alt+g e_|`gitGrace.commitEmpty`|Commit with _--allow-empty_ and the message of _(empty commit)_.|
|_alt+g m_|`gitGrace.master`|Fetch and checkout the commit at _origin/master_ without creating a branch. You will be asked if you want to stash or discard the dirty files beforehand.|
|_alt+g n_|`gitGrace.branch`|Create a new branch at the current commit, or rename the current non-master local branch. You will be asked to type a branch name.|
|_alt+g s_|`gitGrace.checkout`|Fetch and checkout an existing branch.|
|_alt+g h_|`gitGrace.openWeb`|Open the link to the active file in your web browser.|
|_alt+g j_|`gitGrace.pullRequest`|Push and open the link to GitHub pull-request creation page in your web browser, which is something like _http://github.com/user/repository/compare/master...branch_.|
|_alt+g g_|`gitGrace.sync`|Push to _origin_ then pull with _--all_, _--rebase_ and finally pushes everything to _origin_. You will be asked to commit beforehand if the repository is dirty.|
|_alt+g o_|`gitGrace.showOutput`|Open the output channel for **GitGrace** extension.|
|_alt+g q_|`gitGrace.urgent`|Commit all files with the message of "(work-in-progress)", create WIP tag, and push only the tag. This command is useful when you want to leave your computer and continue where you left off on another computer.|
|_alt+g w_|`gitGrace.urgentRestore`|Checkout and delete WIP tag that corresponding to the current local branch.|
|_alt+g l_|`tortoiseGit.showLog`|Show the log messages for the whole repository.|
|_alt+g k_|`tortoiseGit.showFileLog`|Show the log messages for the current active file.|
|_alt+g v_|`tortoiseGit.commit`|Commit with **TortoiseGit**.|
|_alt+g b_|`tortoiseGit.blame`|Open **TortoiseGitBlame** for the current active file.|
|_alt+s s_|`gitGrace.stash`|Save an unnamed stash with _--include-untracked_.|
|_alt+s p_|`gitGrace.stashPopLatest`|Restore the last stash without hassle.|
|_alt+s l_|`gitGrace.stashPop`|Open the stash list and restore the selected stash.|

**TortoiseGit** integration (Windows exclusive) is slightly modified from [Marko Binic's **TortoiseGit Commands**](https://marketplace.visualstudio.com/items?itemName=mbinic.tgit-cmds) extension. By default, the path to **TortoiseGit** executable is `C:\Program Files\TortoiseGit\bin\TortoiseGitProc.exe`, but it can be changed later at `gitGrace.tortoiseGitPath` setting.

Additionally, **Git Grace** also provides a special command **Delete Merged Branches...** (`gitGrace.deleteMergedBranches`), which searches and deletes all the merged branches. You will be asked if you want to proceed once all the merged branches have been counted.
