### 1.1.0
- Amended "gitGrace.fetch" and "gitGrace.pull" commands so they stop showing "There were no updates" message.
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
