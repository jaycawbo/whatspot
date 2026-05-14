# Project Bronco — Shared Context

This file is prepended to every issue session. Keep it up to date.

## Core Project Context
CLAUDE.md is automatically loaded by Claude Code and covers the full tech stack,
coding rules, protected files, and Git workflow. Do not duplicate it here.

## WhatSpot Snapshot
<!-- Jake: paste the contents of WHATSPOT_SNAPSHOT.md below this line -->


<!-- End of snapshot -->

## Bronco System Notes
- Issues run sequentially: #170 → #171 → ... → #181
- Each session creates its own branch: jake/[issue-number]-[slug]
- Supabase migrations cannot be automated — Claude will output SQL and pause
- Stripe and Twilio are not yet configured — Claude will create stubs with env var placeholders
- Each session must update downstream issue files in bronco/issues/ with learnings before closing
