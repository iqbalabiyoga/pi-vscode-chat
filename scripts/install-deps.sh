#!/usr/bin/env bash
# ── Pi VS Code Chat — One-click dependency installer ──
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

CHECK=()
FAIL=()
INSTALLED=()
MISSING=()

info()  { echo -e "${CYAN}[i]${NC} $*"; }
ok()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*"; FAIL+=("$1"); }
header() { echo -e "\n${BOLD}$*${NC}"; }
cmd_avail() { command -v "$1" &>/dev/null; }

# ── Phase 1: Detect ──
header "━━━ Checking environment ───────────────────────────────"

# bun
if cmd_avail bun; then
  ok "bun $(bun --version 2>/dev/null)"
  INSTALLED+=("bun")
else
  warn "bun not found — package manager needed for pi install"
  MISSING+=("bun")
fi

# node
if cmd_avail node; then
  ok "node $(node --version 2>/dev/null)"
  INSTALLED+=("node")
else
  fail "node not found"
  MISSING+=("node")
fi

# ── Phase 2: Check pi binary ──
header "━━━ pi coding agent ──────────────────────────────────────"

PI_INSTALLED=false
PI_VERSION=""
if cmd_avail pi; then
  PI_VERSION=$(pi --version 2>/dev/null || echo "?")
  ok "pi binary found — version $PI_VERSION at $(command -v pi)"
  PI_INSTALLED=true
  INSTALLED+=("pi")
else
  fail "pi not on PATH"
  MISSING+=("pi")
fi

# Check pi npm global package
PI_NPM_OK=false
if bun pm ls -g 2>/dev/null | grep -q '@earendil-works/pi-coding-agent'; then
  PI_NPM_OK=true
  ok "pi npm package installed globally"
elif npm ls -g --depth=0 2>/dev/null | grep -q '@earendil-works/pi-coding-agent'; then
  PI_NPM_OK=true
  ok "pi npm package installed globally (npm)"
else
  FAIL+=("pi-npm")
  MISSING+=("@earendil-works/pi-coding-agent (npm global)")
fi

# ── Phase 3: Check pi skills ──
header "━━━ pi skills & extensions ────────────────────────────────"

SKILL_DIRS=(
  "$HOME/.pi/agent/npm/node_modules"
  "$HOME/.pi/agent/extensions"
  "$HOME/.agents/skills"
)

SKILLS_REQUIRED=(
  "context-mode:Context-aware session management"
  "pi-superpowers:Superpowers (plans, review, debugging)"
  "pi-subagents:Multi-agent orchestration"
  "pi-agents-team:Team-based delegation"
  "pi-caveman:Token compression"
  "pi-web-access:Web research"
  "pi-mcp-adapter:MCP server connectivity"
)
SKILLS_INSTALLED=0
SKILLS_MISSING=0

for entry in "${SKILLS_REQUIRED[@]}"; do
  name="${entry%%:*}"
  desc="${entry#*:}"
  found=false
  for dir in "${SKILL_DIRS[@]}"; do
    if [ -d "$dir/$name" ]; then
      found=true
      break
    fi
  done
  # Also check as a pi extension
  if [ -d "$HOME/.pi/agent/extensions/$name" ]; then
    found=true
  fi
  # Check as npm global package
  if bun pm ls -g 2>/dev/null | grep -qF "$name" || npm ls -g --depth=0 2>/dev/null | grep -qF "$name"; then
    found=true
  fi

  if $found; then
    ok "$name — $desc"
    ((SKILLS_INSTALLED++))
  else
    warn "$name — $desc (not installed)"
    MISSING+=("$name ($desc)")
    ((SKILLS_MISSING++))
  fi
done

if [ $SKILLS_MISSING -eq 0 ]; then
  ok "All recommended skills installed"
else
  warn "$SKILLS_MISSING skill(s) not installed"
fi

# ── Phase 4: Check VS Code extension build deps ──
header "━━━ project build dependencies ────────────────────────────"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

if [ -d node_modules ]; then
  # Check key packages exist
  if [ -d node_modules/marked ] && [ -d node_modules/highlight.js ]; then
    ok "npm packages installed (marked, highlight.js, etc.)"
  else
    warn "node_modules exists but marked/highlight.js missing — run 'bun install'"
    MISSING+=("bun install (project deps)")
  fi
else
  warn "node_modules not found — run 'bun install' to build the extension"
  MISSING+=("bun install (project deps)")
fi

# ── Phase 5: Summary ──
header "━━━ Summary ──────────────────────────────────────────────"

if [ ${#MISSING[@]} -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All dependencies satisfied.${NC} Pi Chat is ready to use."
  echo ""
  info "pi version: $PI_VERSION"
  info "skills loaded: $SKILLS_INSTALLED / ${#SKILLS_REQUIRED[@]}"
  echo ""
  exit 0
else
  echo -e "${YELLOW}${BOLD}${#MISSING[@]} item(s) need attention:${NC}"
  for item in "${MISSING[@]}"; do
    echo -e "  ${YELLOW}•${NC} $item"
  done
  echo ""
fi

# ── Phase 6: Install ──
if [ ${#MISSING[@]} -eq 0 ]; then
  exit 0
fi

echo -e "${BOLD}Install all missing dependencies? [Y/n]${NC} "
read -r REPLY
if [[ ! "$REPLY" =~ ^[Yy]?$ ]]; then
  echo "Aborted."
  exit 1
fi

header "━━━ Installing ──────────────────────────────────────────"

# 1. Install bun (if missing)
if ! cmd_avail bun; then
  info "Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  # Reload PATH
  export PATH="$HOME/.bun/bin:$PATH"
  if cmd_avail bun; then
    ok "bun installed — $(bun --version)"
  else
    fail "bun install failed — install manually: curl -fsSL https://bun.sh/install | bash"
  fi
fi

# 2. Install pi binary
if ! cmd_avail pi; then
  if cmd_avail bun; then
    info "Installing @earendil-works/pi-coding-agent globally..."
    bun add -g @earendil-works/pi-coding-agent
    if cmd_avail pi; then
      ok "pi installed — $(pi --version 2>/dev/null || true)"
    else
      warn "pi binary not on PATH after install. Ensure ~/.bun/bin is in PATH"
    fi
  fi
fi

# 3. Install missing pi skills via npm
MISSING_SKILLS=()
for entry in "${SKILLS_REQUIRED[@]}"; do
  name="${entry%%:*}"
  found=false
  for dir in "${SKILL_DIRS[@]}"; do
    [ -d "$dir/$name" ] && found=true && break
  done
  [ -d "$HOME/.pi/agent/extensions/$name" ] && found=true
  bun pm ls -g 2>/dev/null | grep -qF "$name" && found=true
  npm ls -g --depth=0 2>/dev/null | grep -qF "$name" && found=true

  if ! $found; then
    MISSING_SKILLS+=("$name")
  fi
done

if [ ${#MISSING_SKILLS[@]} -gt 0 ]; then
  info "Installing pi skills..."
  for skill in "${MISSING_SKILLS[@]}"; do
    info "  Installing $skill..."
    # Try npm first, then bun
    if npm ls -g "$skill" &>/dev/null 2>&1; then
      warn "  $skill already installed"
      continue
    fi
    # Skills are installed via pi's own mechanism — they go into
    # ~/.pi/agent/npm/node_modules/ when installed with npm/bun -g
    if [ "$skill" = "context-mode" ]; then
      bun add -g context-mode 2>/dev/null || npm install -g context-mode 2>/dev/null || warn "  $skill install failed (non-critical)"
    else
      bun add -g "$skill" 2>/dev/null || npm install -g "$skill" 2>/dev/null || warn "  $skill install failed (non-critical)"
    fi
  done
  ok "Skill install complete"
fi

# 4. Install project npm dependencies
if [ ! -d node_modules ] || [ ! -d node_modules/marked ]; then
  info "Installing project dependencies..."
  cd "$PROJECT_DIR"
  bun install 2>/dev/null || npm install 2>/dev/null || warn "bun install failed — run manually: cd $PROJECT_DIR && bun install"
  if [ -d node_modules/marked ]; then
    ok "Project dependencies installed"
  fi
fi

# ── Done ──
header "━━━ Complete ────────────────────────────────────────────"
echo ""
echo -e "${GREEN}${BOLD}Install complete.${NC}"
echo ""
echo -e "  ${CYAN}Next steps:${NC}"
echo -e "  • Reload VS Code window if it's open"
echo -e "  • Open Pi Chat sidebar from the activity bar"
echo -e "  • If pi binary still not found, add to PATH:"
echo -e "      export PATH=\"\$HOME/.bun/bin:\$PATH\""
echo ""
echo -e "  ${CYAN}Quick check:${NC} run this script again to verify"
echo ""
