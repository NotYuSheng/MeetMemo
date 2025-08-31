---
allowed-tools: Bash(git *:*), Bash(gh *:*)
description: Push current changes to GitHub following proper branch/commit conventions and optionally create a pull request
argument-hint: Commit message (e.g., "feat: add user authentication") or PR title
---

## Context
Current git status:
!`git status`

Recent commits:
!`git log --oneline -5`

Current branch:
!`git branch --show-current`

## Push to GitHub with Proper Conventions

Push the current branch to GitHub following proper Git conventions:
- Branch naming: feat/*, fix/*, chore/*, docs/*, etc.
- Commit messages: type: description (e.g., "feat: add user login", "fix: resolve memory leak")

Arguments: $ARGUMENTS

## Key Rule: NEVER push directly to main

Steps:
1. **Check current branch**: If on main, create new feature branch first
2. **Handle uncommitted changes**: Commit with conventional format if needed  
3. **Create feature branch**: Use format `<type>/<description>` (e.g., `feat/user-auth`, `fix/memory-leak`)
4. **Push with upstream tracking**: Push the feature branch to GitHub

**Branch Creation Logic**:
- If on main: Extract type from commit message or arguments to create proper branch name
- Examples: "feat: add auth" → `feat/add-auth`, "fix: memory leak" → `fix/memory-leak`

Execute the push operation following proper Git workflows and conventions.