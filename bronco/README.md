# Project Bronco — Automated Execution System

## How It Works

Each issue has a prompt file in `bronco/issues/`. Running `bronco/run.ps1` invokes Claude CLI
non-interactively for each issue in sequence. Each session:
1. Reads the shared context (`bronco/context.md`) + its own prompt file
2. Creates the branch, implements the feature, commits, pushes, and opens a PR
3. Before closing: updates any downstream issue files with learnings that affect them

## Setup — before running for the first time

1. Open `bronco/context.md` and paste your WHATSPOT_SNAPSHOT.md content in the marked section
2. Open each file in `bronco/issues/` and replace the `## YOUR PROMPT` section with your
   detailed prompt for that issue (the default text is the original GitHub issue description)
3. Run `.\bronco\run.ps1` from the project root in your VS Code terminal

## Running

```powershell
# Run all issues starting from #170
.\bronco\run.ps1

# Resume from a specific issue number (e.g. after a failure at #173)
.\bronco\run.ps1 173
```

The script pauses after each issue and asks you to press Enter before continuing.
Use this time to:
- Review the PR on GitHub
- Run any Supabase migrations Claude flagged with "ACTION REQUIRED"
- Verify the next issue file has been updated with upstream learnings

## Issue Queue

| # | File | Phase | Status |
|---|------|-------|--------|
| 170 | 170-b2-request-modal.md | 1: B-2 | pending |
| 171 | 171-b3-floating-pill.md | 1: B-3 | pending |
| 172 | 172-b4-requests-overlay.md | 1: B-4 | pending |
| 173 | 173-p2-a1-editorial-collections.md | 2: A-1 | pending |
| 174 | 174-p2-a2-spots.md | 2: A-2 | pending |
| 175 | 175-p2-a3-waitlist.md | 2: A-3 | pending |
| 176 | 176-p2-a4-analytics.md | 2: A-4 | pending |
| 177 | 177-p2-b1-push-notifications.md | 2: B-1 | pending |
| 178 | 178-p3-a1-native-prep.md | 3: A-1 | pending |
| 179 | 179-p3-a2-pos-integration.md | 3: A-2 | pending |
| 180 | 180-p4-a1-diner-deposit.md | 4: A-1 | pending |
| 181 | 181-p4-a2-venue-saas.md | 4: A-2 | pending |
