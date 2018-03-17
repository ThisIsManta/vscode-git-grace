### 1.5.0
- Added "gitGrace.branch" command.
- Added "gitGrace.checkout" command.
- Added "gitGrace.stashPopLatest" command.
- Fixed "gitGrance.master" and "gitGrace.deleteMergedBranches" commands so they stop asking for fast forward.

### 1.4.1
- Fixed "gitGrace.deleteMergedBranches" command so it deletes the merged local branches.

### 1.4.0
- Added default keybindings.
- Fixed "gitGrace.push" command so that it will not show "Pushing complete with some updates" unless it really does.

### 1.2.0
- Amended "gitGrace.deleteMergedBranches" command confirmation dialog.
- Amended "gitGrace.deleteMergedBranches" command so it fetches beforehand.

### 1.1.1
- Fixed "gitGrace.master" command so that it awaits the fetch sub-command before checking out.

### 1.1.0
- Amended "gitGrace.fetch" and "gitGrace.pull" commands so they stop showing "There were no updates" message.
- Amended "gitGrace.pullRequest" command so it will not proceed if the repository is dirty.
- Amended queuing command system so that it ignores duplicate commands.
- Added "showOutput" command.

### 1.0.1
- Fixed "gitGrace.deleteMergedBranches" command so that it can delete local branches which their remote counterparts have merged.

### 1.0.0
- Amended "gitGrace.fetch" command so it will not show no updates message while asking to fast forward.
- Amended "gitGrace.master" command so that it it fetches before checking if the current branch is on origin/master already.
- Removed "gitGrace.branch" command in favor of "git.branch" and "gitGrace.master" commands combined.
- Amended some commands so they save all files only if "file.AutoSave" setting is "afterDelay" or "onFocusChange".

### 0.0.2
- Fixed wrong path that caused "gitGrace.openWeb" and "gitGrace.pullRequest" commands unusable in macOS.

### 0.0.1
- Public release.
