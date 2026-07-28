#!/usr/bin/env bash
#
# One-time setup for The Little Arcade.
#
#   1. turns this folder into a Git repo and pushes it to GitHub
#   2. installs the Nutlope/hallmark skill for Claude Code
#
# Run it from inside this folder:
#
#   bash setup.sh
#
# Optional first argument is the repo name (default: little-arcade).
#
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_NAME="${1:-little-arcade}"
GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; OFF=$'\033[0m'

say()  { printf '%s\n' "$*"; }
ok()   { printf '%s[ok]%s %s\n'   "$GREEN"  "$OFF" "$*"; }
warn() { printf '%s[--]%s %s\n'   "$YELLOW" "$OFF" "$*"; }
bad()  { printf '%s[!!]%s %s\n'   "$RED"    "$OFF" "$*"; }
rule() { printf '%s%s%s\n' "$DIM" "------------------------------------------------------------" "$OFF"; }

say
say "The Little Arcade - setup"
rule

# ---------------------------------------------------------------- 1. Git
say
say "1. Git repository"

if ! command -v git >/dev/null 2>&1; then
  bad "git is not installed. Install Xcode command line tools first:"
  say "     xcode-select --install"
  exit 1
fi

if [ -d .git ]; then
  ok "already a git repo, skipping init"
else
  git init -q -b main
  ok "git repo created"
fi

git add -A
if git diff --cached --quiet 2>/dev/null; then
  ok "nothing new to commit"
else
  git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo 'Kshitij')}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo 'scriptkiddie22@gmail.com')}" \
      commit -q -m "The Little Arcade: six pixel-art games for children"
  ok "committed $(git rev-list --count HEAD) revision(s)"
fi

# The empty repo already exists on GitHub. Work out which transport is
# actually authenticated on this machine rather than assuming HTTPS.
GH_USER="${GH_USER:-KshitijKoranne}"
SSH_URL="git@github.com:${GH_USER}/${REPO_NAME}.git"
HTTPS_URL="https://github.com/${GH_USER}/${REPO_NAME}.git"

say "   checking which git transport is authenticated..."
TRANSPORT=""

# GitHub's SSH check exits 1 even on success, so match the banner text.
if ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -T git@github.com 2>&1 \
     | grep -qi "successfully authenticated"; then
  TRANSPORT="ssh"
  ok "SSH key works for github.com"
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  TRANSPORT="https"
  ok "gh CLI is logged in; it supplies HTTPS credentials"
  gh auth setup-git >/dev/null 2>&1 || true
elif git credential fill <<<"protocol=https
host=github.com
" 2>/dev/null | grep -q "^password="; then
  TRANSPORT="https"
  ok "a stored HTTPS credential was found in the keychain"
else
  TRANSPORT="none"
  warn "no working GitHub credential found on this machine"
fi

if [ "$TRANSPORT" = "ssh" ]; then
  TARGET="$SSH_URL"
else
  TARGET="$HTTPS_URL"
fi

if git remote get-url origin >/dev/null 2>&1; then
  CURRENT="$(git remote get-url origin)"
  if [ "$CURRENT" != "$TARGET" ]; then
    git remote set-url origin "$TARGET"
    ok "remote 'origin' repointed: $CURRENT -> $TARGET"
  else
    ok "remote 'origin': $CURRENT"
  fi
else
  git remote add origin "$TARGET"
  ok "remote 'origin' -> $TARGET"
fi

if [ "$TRANSPORT" = "none" ]; then
  bad "cannot push: git has no GitHub credentials here."
  say
  say "   Pick whichever you prefer, then re-run this script:"
  say
  say "     a) SSH  (you may already have a key):"
  say "          ssh-keygen -t ed25519 -C '$(git config user.email 2>/dev/null || echo you@example.com)'"
  say "          pbcopy < ~/.ssh/id_ed25519.pub"
  say "          # paste it at https://github.com/settings/ssh/new"
  say
  say "     b) gh CLI:"
  say "          brew install gh && gh auth login"
  say
  say "   Nothing else in this folder needs changing - the commit is ready to go."
else
  say "   pushing to $(git remote get-url origin) ..."
  # Fail fast instead of hanging on an invisible credential prompt.
  if GIT_TERMINAL_PROMPT=0 git push -u origin main; then
    ok "pushed"
    say "   https://github.com/${GH_USER}/${REPO_NAME}"
  else
    bad "push failed - the git error is printed directly above."
    say
    say "   Diagnostics:"
    say "     branch:  $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
    say "     commits: $(git rev-list --count HEAD 2>/dev/null)"
    say "     remote:  $(git remote get-url origin 2>/dev/null)"
    say "     files:   $(git ls-files | wc -l | tr -d ' ') tracked"
    say
    say "   Paste the error above back to Claude and it will sort it out."
  fi
fi

# ------------------------------------------------------------ 2. hallmark
say
rule
say
say "2. Hallmark skill for Claude Code"

if ! command -v npx >/dev/null 2>&1; then
  warn "npx not found, so hallmark cannot be installed automatically."
  say "   Install Node first (brew install node), then run:"
  say "     npx -y skills add nutlope/hallmark -y -g"
else
  # -y skips the prompts, -g installs to the global skills dir.
  # Without -g it installs into the CURRENT FOLDER, which is not what
  # 'available to every session' means.
  say "   installing globally (npx -y skills add nutlope/hallmark -y -g) ..."
  if npx -y skills add nutlope/hallmark -y -g; then
    ok "installer finished"
  else
    warn "the installer did not finish cleanly. Manual fallback:"
    say "     git clone https://github.com/Nutlope/hallmark /tmp/hallmark"
    say "     mkdir -p ~/.claude/skills/hallmark"
    say "     cp -R /tmp/hallmark/SKILL.md /tmp/hallmark/references ~/.claude/skills/hallmark/"
  fi
fi

# It reports a couple of unrelated agents as "failed" (Eve and PromptScript
# have no global skills dir). That is expected and harmless - what matters
# is the Claude Code path below.
if [ -f "$HOME/.claude/skills/hallmark/SKILL.md" ]; then
  ok "verified: ~/.claude/skills/hallmark/SKILL.md ($(wc -l < "$HOME/.claude/skills/hallmark/SKILL.md" | tr -d ' ') lines)"
  ok "references: $(ls -1 "$HOME/.claude/skills/hallmark/references" 2>/dev/null | wc -l | tr -d ' ') files"
  say "   every Claude Code session on this machine can now use it."
else
  warn "could not verify ~/.claude/skills/hallmark/SKILL.md"
  say "   check whether it landed in ~/.agents/skills/hallmark instead:"
  say "     ls -l ~/.agents/skills/hallmark ~/.claude/skills/hallmark"
fi

# ------------------------------------------------------------------ done
say
rule
say
say "Next: point games.kjrlabs.in at the VPS and deploy in Coolify."
say "Full steps are in DEPLOY.md in this folder."
say
