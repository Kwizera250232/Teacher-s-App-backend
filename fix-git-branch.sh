#!/bin/bash

# Git Branch Fix Script
# This script helps identify and fix git branch issues

echo "=== Git Branch Diagnostic ==="
echo ""

# Check current directory
echo "Current directory: $(pwd)"
echo ""

# Check if this is a git repository
if [ ! -d ".git" ]; then
    echo "Error: Not a git repository"
    exit 1
fi

# Check current branch
echo "Current branch: $(git branch --show-current)"
echo ""

# List all branches
echo "Available branches:"
git branch -a
echo ""

# Check remote branches
echo "Remote branches:"
git branch -r
echo ""

# Check if main branch exists
if git show-ref --verify --quiet refs/heads/main; then
    echo "✓ Local 'main' branch exists"
else
    echo "✗ Local 'main' branch does NOT exist"
fi

# Check if master branch exists
if git show-ref --verify --quiet refs/heads/master; then
    echo "✓ Local 'master' branch exists"
else
    echo "✗ Local 'master' branch does NOT exist"
fi

echo ""
echo "=== Recommended Actions ==="

# Determine the primary branch
PRIMARY_BRANCH=""
if git show-ref --verify --quiet refs/heads/main; then
    PRIMARY_BRANCH="main"
elif git show-ref --verify --quiet refs/heads/master; then
    PRIMARY_BRANCH="master"
else
    echo "No primary branch found. You may need to clone the repository fresh."
    exit 1
fi

echo "Primary branch: $PRIMARY_BRANCH"
echo ""
echo "To update this repository, run:"
echo "  git fetch origin"
echo "  git checkout $PRIMARY_BRANCH"
echo "  git pull origin $PRIMARY_BRANCH"
