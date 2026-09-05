# Recovering the previous application

The pre-Studio application is preserved at commit [`27513a835c5fc9a6bd4a2d98813a04a8afbc55d4`](https://github.com/lovejzzz/CourseMapper/tree/27513a835c5fc9a6bd4a2d98813a04a8afbc55d4). The local `codex/pre-studio-rebuild` branch points to that commit.

The v0.19 rebuild retires the old compiler, Firebase application, historical grading campaigns, release-contract snapshots and their default CI gates. Those files remain in Git history. They are not evidence that the new course engine meets an educational quality threshold.

To inspect or run the earlier implementation in a separate checkout:

```sh
git worktree add ../CourseMapper-previous 27513a835c5fc9a6bd4a2d98813a04a8afbc55d4
cd ../CourseMapper-previous
npm ci
npm run dev
```

Studio uses a new `.edutool.json` project format. It does not migrate previous compiler project files or Firebase accounts. Opening the new site does not erase previous browser storage or remote data. Browser storage belongs to an origin: running the old code at a different origin will not automatically reveal data saved on edutool.dev. For browser-only recovery, export from the original workspace or restore its deployment at the original origin before importing elsewhere. Keep backups and avoid posting private courses to public issues.

During the local rebuild, existing `trellis/`, `public/` and `runtime/` research artifacts, including model weights and adapter checkpoints, were removed from the default repository index but retained on disk. New clones obtain the earlier tracked artifacts from the historical commit when needed. The current website does not download them automatically.
