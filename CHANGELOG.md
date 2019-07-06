### 2.13.0
- Removed `gitGrace.urgent` and `gitGrace.urgentRestore` commands due to low usage.
- Amended `gitGrace.deleteMergedBranches` command so it reports its progress as a notification window instead of the status bar.

### 2.12.2
- Added `gitGrace.stageAll`, `gitGrace.unstageAll`, and `gitGrace.cleanAll` commands in favor of the built-in commands.
- Fixed `gitGrace.blame` and `gitGrace.openWeb` commands so they use the pushed commit hash.

### 2.12.1
- Added keybinding of `git.stageAll` command.
- Amended `gitGrace.pullRequest` command so it does wait for `gitGrace.push` to be finished beforehand.

### 2.12.0
- Added `gitGrace.blame` command in favor of `tortoiseGit.blame` command.
- Amended `gitGrace.openWeb` command so it scrolls to the current line.

### 2.11.1
- Amended `gitGrace.master` command so it shows the loading status.
- Amended `gitGrace.branch` command so it stops calling `git.branch` command.

### 2.11.0
- Added `gitGrace.squash` command.
- Added `gitGrace.deleteBranch` command.
- Removed the keybindings for `gitGrace.urgent` and `gitGrace.urgentRestore` commands.

### 2.10.4
- Fixed deprecated Git built-in extension API.

### 2.10.3
- Fixed usage tracking function.

### 2.10.2
- Fixed wrong extension identifier in the usage tracking function.

### 2.10.1
- Fixed could not find usage tracking function.

### 2.10.0
- Added usage tracking function.
- Amended `gitGrace.openWeb` command so it lists the current commit hash and branch names instead of the partial URLs.
- Amended `gitGrace.sync` command so it does push before pull.
- Amended `gitGrace.sync` command so it deletes merged local branches that have no remote counterparts.
- Amended `gitGrace.sync` command so it operates on all opening workspaces.
- Amended `gitGrace.commitSmart` command so it does not show version messages.
- Fixed `gitGrace.checkout` command so it does not always overwrite the existing local branch.
- Fixed `gitGrace.checkout` command so it prompts syncing the remote branch even after the local branch has been selected.

### 2.9.0
- Amended `gitGrace.commitSmart` command so it accepts free-text input.
- Amended `gitGrace.commitSmart` command so it sorts the recent messages by chronological order.
- Amended `gitGrace.checkout` and `gitGrace.master` commands so they ask if users want to proceed losing the changes made in the dangling commits.

### 2.8.1
- Fixed `gitGrace.pullRequest` command so it opens the web after push.

### 2.8.0
- Added _--no-pager_ for all Git commands.
- Amended `gitGrace.checkout` command so it uses the new _QuickPick_ API from _vscode_.
- Amended `gitGrace.checkout` command so it cancels the pending `gitGrace.fetch` command.
- Refactored `gitGrace.deleteMergedBranches` command.

### 2.7.0
- Added `gitGrace.commitSmart` command.
- Amended `gitGrace.fetch` and `gitGrace.checkout` commands so they will ask for a hard reset if the remote commits were solely rebased.
- Fixed "No Git repository" error throwing from built-in Git extension.

### 2.6.3
- Fixed `gitGrace.push` command so it fetches and asks if users want to rebase/merge the local branch.

### 2.6.2
- Fixed unexpected fetching when no workspaces opened.
- Amended `gitGrace.branch` command so it also deletes the remote branch when renaming.

### 2.6.1
- Fixed missing progress for `gitGrace.push` command.

### 2.6.0
- Added `gitGrace.stashClear` command.
- Amended progress location back to the status bar.
- Amended `gitGrace.fetch` and `gitGrace.checkout` commands so they will not ask for a rebase/merge if the remote commits were solely amended.

### 2.4.0
- Amended `gitGrace.fetch` and `gitGrace.checkout` commands so they ask if users want to sync the local branch with its remote branch.
- Amended `gitGrace.checkout` command so it fetches in the background.
- Amended `gitGrace.push` command so it fetches and asks if users want to rebase/merge the local branch.
- Amended progress location to the notification area.
- Fixed unexpectedly found the remote branch when it is deleted locally.

### 2.3.0
- Amended `gitGrace.push` command so it asks for force pushing promptly.

### 2.2.0
- Amended `gitGrace.fetch` and `gitGrace.push` status messages.
- Amended `gitGrace.fetch` command so it does a non-blocking fast forward operation.

### 2.1.0
- Amended `gitGrace.checkout` command so it asks if users want to fast forward.
- Amended internal command cool down time to 60 seconds.

### 2.0.2
- Amended `gitGrace.branch` command so it untracks its old remote branch.

### 2.0.1
- Fixed `gitGrace.checkout` command so it picks the newly created branches.

### 2.0.0
- Added `gitGrace.urgent` and `gitGrace.urgentRestore` commands.
- Amended keybinding of `git.unstageAll` command from `alt+g q` to `alt+g z` in favor of `gitGrace.urgent` command.

### 1.5.0
- Added `gitGrace.branch` command.
- Added `gitGrace.checkout` command.
- Added `gitGrace.stashPopLatest` command.
- Added `gitGrace.stashPop` command.
- Added stash count status bar.
- Fixed "gitGrance.master" and `gitGrace.deleteMergedBranches` commands so they stop asking for fast forward.

### 1.4.1
- Fixed `gitGrace.deleteMergedBranches` command so it deletes the merged local branches.

### 1.4.0
- Added default keybindings.
- Fixed `gitGrace.push` command so that it will not show "Pushing complete with some updates" unless it really does.

### 1.2.0
- Amended `gitGrace.deleteMergedBranches` command confirmation dialog.
- Amended `gitGrace.deleteMergedBranches` command so it fetches beforehand.

### 1.1.1
- Fixed `gitGrace.master` command so that it awaits the fetch sub-command before checking out.

### 1.1.0
- Amended `gitGrace.fetch` and `gitGrace.pull` commands so they stop showing "There were no updates" message.
- Amended `gitGrace.pullRequest` command so it will not proceed if the repository is dirty.
- Amended queuing command system so that it ignores duplicate commands.
- Added "showOutput" command.

### 1.0.1
- Fixed `gitGrace.deleteMergedBranches` command so that it can delete local branches which their remote counterparts have merged.

### 1.0.0
- Amended `gitGrace.fetch` command so it will not show no updates message while asking to fast forward.
- Amended `gitGrace.master` command so that it it fetches before checking if the current branch is on origin/master already.
- Removed `gitGrace.branch` command in favor of "git.branch" and `gitGrace.master` commands combined.
- Amended some commands so they save all files only if "file.AutoSave" setting is "afterDelay" or "onFocusChange".

### 0.0.2
- Fixed wrong path that caused `gitGrace.openWeb` and `gitGrace.pullRequest` commands unusable in macOS.

### 0.0.1
- Public release.
