#!/usr/bin/env bash
# push.sh - force-push this folder to GitHub (branch main) in small batches.
#
#   bash push.sh                    # asks for a commit message
#   bash push.sh "new lessons"      # message as argument
#   REPO_URL=https://github.com/you/ogombo.git bash push.sh
#   GITHUB_TOKEN=ghp_xxx bash push.sh        # skips the token prompt
#   BATCH_FILES=100 BATCH_MB=30 bash push.sh # smaller batches on a weak connection
#   BUMP=minor|major|none bash push.sh       # VERSION bump (only if a VERSION file exists)
#
# What it does
#   - Commits + pushes in batches (default 200 files or 40 MB each), so folders with
#     1600+ files never go up as one giant push. Every batch is force-pushed on its own.
#   - Files over 50 MB are split into 15 MB parts (name.part00, name.part01 ...) with an
#     .md5 file; the original stays on disk but is not pushed. join-large-files.sh
#     rebuilds them after a clone.
#   - No timeouts. Network errors retry forever with a growing wait (max 60 s).
#     Login / missing repo / too-big-file / protected-branch errors stop with a clear message.
#   - Resumes: run it again and it continues from the last batch that reached GitHub.
#   - Every error is saved to  .git/push-logs/errors.log  (never committed).
#   - Shows a progress bar.
#
# Login: GitHub needs a Personal Access Token (scope "repo") as the password.

set -u
BRANCH="${BRANCH:-main}"
BATCH_FILES="${BATCH_FILES:-200}"
BATCH_MB="${BATCH_MB:-40}"
BIG_MB="${BIG_MB:-50}"
PART_MB="${PART_MB:-15}"
BUMP="${BUMP:-patch}"
TOKEN="${GITHUB_TOKEN:-}"
DEFAULT_URL="https://github.com/jitetee/ogombo.git"
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

say()  { printf '\033[38;5;51m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[38;5;120m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[38;5;221m⚠\033[0m %s\n' "$*"; }
die()  { printf '\033[38;5;203m✖\033[0m %s\n' "$*" >&2; exit 1; }

for t in git split md5sum stat find; do command -v "$t" >/dev/null 2>&1 || die "Missing '$t'. In Termux: pkg install git coreutils findutils"; done
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null
PUSHPID=""
cleanup() { command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock 2>/dev/null; }
trap cleanup EXIT
trap 'printf "\n"; [[ -n $PUSHPID ]] && kill "$PUSHPID" 2>/dev/null; warn "Stopped. Run again and it continues where it stopped."; exit 130' INT TERM

# ---------- 1. repo, identity, remote, branch ----------
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  say "Not a git repo yet: running git init"
  git init -q -b "$BRANCH" 2>/dev/null || { git init -q && git checkout -q -b "$BRANCH"; }
fi
ROOT=$(git rev-parse --show-toplevel); cd "$ROOT" || exit 1
GD=$(git rev-parse --absolute-git-dir)
ST="$GD/push-state"; LOGDIR="$GD/push-logs"; ERRLOG="$LOGDIR/errors.log"; OUT="$ST/last.out"
mkdir -p "$ST" "$LOGDIR"
COLS=$(tput cols 2>/dev/null || echo 60)

if [[ -z $(git config user.name) ]]; then
  read -r -p "  Git name  (for commits): " n; [[ -n $n ]] || die "A name is needed."; git config user.name "$n"
fi
if [[ -z $(git config user.email) ]]; then
  read -r -p "  Git email (for commits): " e; [[ -n $e ]] || die "An email is needed."; git config user.email "$e"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  URL="${REPO_URL:-}"
  if [[ -z $URL ]]; then read -r -p "  GitHub repo URL [$DEFAULT_URL]: " URL; URL="${URL:-$DEFAULT_URL}"; fi
  git remote add origin "$URL"; ok "Remote origin → $URL"
elif [[ -n ${REPO_URL:-} ]]; then
  git remote set-url origin "$REPO_URL"
fi
REMOTE=$(git remote get-url origin)
say "Remote → $REMOTE   branch → $BRANCH"
if [[ $(cat "$ST/remote" 2>/dev/null) != "$REMOTE" ]]; then rm -f "$ST/pushed" "$ST/bumped"; echo "$REMOTE" > "$ST/remote"; fi

CUR=$(git symbolic-ref --short -q HEAD || echo "")
[[ $CUR == "$BRANCH" ]] || git checkout -q -B "$BRANCH" 2>/dev/null || git branch -M "$BRANCH"

# no timeouts, big buffer, stable protocol
git config http.postBuffer 524288000
git config http.version HTTP/1.1
git config http.lowSpeedLimit 0
git config http.lowSpeedTime 0

# ---------- 2. basic .gitignore ----------
if [[ ! -f .gitignore ]] || grep -qE '^(data/|\*\.zip|auth)$' .gitignore; then
  cat > .gitignore <<'G'
# secrets
.env
.env.*

# dependencies and caches
node_modules/
__pycache__/
*.pyc

# editor / OS noise
*.log
*.swp
*~
.DS_Store
Thumbs.db
.idea/
.vscode/
G
  ok ".gitignore set to the basic template"
fi

# ---------- helpers ----------
bar() { # bar done total label
  local cur=$1 tot=$2 label=${3:-} w=24 b="" i f p
  ((tot < 1)) && tot=1; ((cur > tot)) && cur=$tot
  f=$((cur * w / tot)); p=$((cur * 100 / tot))
  for ((i = 0; i < w; i++)); do ((i < f)) && b+="█" || b+="░"; done
  printf '\033[38;5;51m%s\033[0m %3d%% %s\n' "$b" "$p" "$label"
}

classify() {
  case "$1" in
    *GH001*|*"larger than"*|*"exceeds GitHub"*|*"pack exceeds"*) echo size ;;
    *GH006*|*"protected branch"*) echo protected ;;
    *"Authentication failed"*|*"could not read Username"*|*"could not read Password"*|*"Permission denied"*|*"denied to"*|*" 403"*|*" 401"*|*"Invalid username"*) echo auth ;;
    *"Repository not found"*|*"repository not found"*) echo missing ;;
    *) echo net ;;
  esac
}

logerr() { # label class
  { printf '\n[%s] %s  (%s)\n' "$(date '+%F %T')" "$1" "$2"; tr '\r' '\n' < "$OUT" | grep -v '^$' | tail -15; } >> "$ERRLOG"
}

set_token() {
  GA=(-c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)")
}
GA=(); [[ -n $TOKEN ]] && set_token

ask_token() {
  [[ -t 0 ]] || return 1
  printf '  GitHub token (input hidden): '; read -rs TOKEN; printf '\n'
  [[ -n $TOKEN ]] || return 1
  set_token
}

push_sha() { # sha label
  local sha=$1 label=$2 try=1 wait=10 rc cls t0 line w asked=0
  while :; do
    : > "$OUT"; t0=$SECONDS
    GIT_TERMINAL_PROMPT=0 git "${GA[@]}" push --progress --force origin "$sha:refs/heads/$BRANCH" >"$OUT" 2>&1 &
    PUSHPID=$!
    while kill -0 "$PUSHPID" 2>/dev/null; do
      line=$(tr '\r' '\n' < "$OUT" | grep -v '^$' | tail -1)
      w=$((COLS - 12 - ${#label})); ((w < 10)) && w=10
      printf '\r\033[K  ↑ %s %ss %.*s' "$label" $((SECONDS - t0)) "$w" "$line"
      sleep 1
    done
    wait "$PUSHPID"; rc=$?; PUSHPID=""
    printf '\r\033[K'
    if ((rc == 0)); then echo "$sha" > "$ST/pushed"; return 0; fi
    cls=$(classify "$(cat "$OUT")"); logerr "$label" "$cls"
    case $cls in
      auth)
        if ((asked == 0)) && ask_token; then asked=1; continue; fi
        die "GitHub refused the login. Use a Personal Access Token (scope: repo) as the password, or run: GITHUB_TOKEN=ghp_xxx bash push.sh" ;;
      missing)
        die "GitHub says the repo wasn't found: $REMOTE. Create it empty on github.com (or check the name and that your token can access it), then run again." ;;
      protected)
        die "Branch '$BRANCH' is protected, so force-push is blocked. On GitHub: Settings → Branches → allow force pushes (or remove the rule), then run again." ;;
      size)
        grep -iE 'GH001|larger than|exceeds' "$OUT" | head -5
        die "A file is over GitHub's 100 MB limit. Lower BIG_MB (e.g. BIG_MB=40 bash push.sh) so it gets split, then run again." ;;
      *)
        warn "Network problem: $(tr '\r' '\n' < "$OUT" | grep -v '^$' | tail -1 | cut -c1-80)"
        say "Retry #$try in ${wait}s (no limit; Ctrl-C to stop, run again to resume)"
        sleep "$wait"; wait=$((wait * 2)); ((wait > 60)) && wait=60; try=$((try + 1)) ;;
    esac
  done
}

push_pending() { # pushes every unpushed commit, oldest first, one push each
  local last range list sha n k=0
  last=$(cat "$ST/pushed" 2>/dev/null || true)
  if [[ -n $last ]] && git merge-base --is-ancestor "$last" HEAD 2>/dev/null; then range="$last..HEAD"; else range="HEAD"; fi
  git rev-parse --verify -q HEAD >/dev/null 2>&1 || return 0
  mapfile -t list < <(git rev-list --reverse "$range")
  n=${#list[@]}; ((n == 0)) && return 0
  for sha in "${list[@]}"; do
    k=$((k + 1)); push_sha "$sha" "commit $k/$n"
  done
}

# ---------- 3. split big files ----------
split_big() {
  local f exf="$GD/info/exclude" any=0
  mkdir -p "$GD/info"; touch "$exf"
  while IFS= read -r -d '' f; do
    f=${f#./}
    case $f in *.part[0-9][0-9]) continue ;; esac
    git check-ignore -q -- "$f" && continue
    any=1
    say "Splitting $f ($(du -h "$f" | cut -f1)) into ${PART_MB} MB parts"
    rm -f "$f".part[0-9][0-9]
    split -b "${PART_MB}M" -d -a 2 -- "$f" "$f.part" || die "Could not split $f"
    ( cd "$(dirname "$f")" && md5sum -- "$(basename "$f")" > "$(basename "$f").md5" ) || die "md5 failed for $f"
    printf '/%s\n' "$f" >> "$exf"
    git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 && git rm -q --cached -- "$f"
    ok "$(ls "$f".part[0-9][0-9] | wc -l) parts + md5 for $f"
  done < <(find . -path ./.git -prune -o -type f -size +"${BIG_MB}"M -print0)
  if [[ -n $(find . -path ./.git -prune -o -name '*.part00' -print -quit) ]]; then
    cat > join-large-files.sh <<'J'
#!/usr/bin/env bash
# Rebuilds files that push.sh split into .partNN pieces, then checks their md5.
cd "$(dirname "$0")" || exit 1
find . -name '*.part00' -print0 | while IFS= read -r -d '' p; do
  f=${p%.part00}
  cat "$f".part[0-9][0-9] > "$f" && ( cd "$(dirname "$f")" && md5sum -c "$(basename "$f").md5" )
done
J
  fi
}

bump_version() {
  [[ -f VERSION && $BUMP != none && ! -f $ST/bumped ]] || return 0
  local cur a b c new
  cur=$(tr -d '[:space:]' < VERSION); [[ $cur =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 0
  IFS=. read -r a b c <<<"$cur"
  case $BUMP in major) new="$((a + 1)).0.0" ;; minor) new="$a.$((b + 1)).0" ;; *) new="$a.$b.$((c + 1))" ;; esac
  echo "$new" > VERSION; touch "$ST/bumped"; ok "Version $cur → $new"
  [[ -f README.md ]] && sed -i "s/badge\/version-[0-9.]*-/badge\/version-$new-/" README.md
  if [[ -f docs/CHANGELOG.md ]] && ! grep -q "^## $new\$" docs/CHANGELOG.md; then
    awk -v v="$new" -v m="$MSG" 'NR==1{print; print ""; print "## " v; print "- " m; next} {print}' docs/CHANGELOG.md > docs/CHANGELOG.md.tmp && mv docs/CHANGELOG.md.tmp docs/CHANGELOG.md
  fi
}

# ---------- 4. start ----------
git reset -q 2>/dev/null || true       # unstage leftovers from an interrupted run

# check the remote early (asks for a token if needed)
chk=$(GIT_TERMINAL_PROMPT=0 git "${GA[@]}" ls-remote --heads origin 2>&1); rc=$?
if ((rc != 0)); then
  cls=$(classify "$chk")
  printf '%s\n' "$chk" > "$OUT"; logerr "preflight" "$cls"
  case $cls in
    auth) ask_token || die "A GitHub token is needed (scope: repo)."
          chk=$(GIT_TERMINAL_PROMPT=0 git "${GA[@]}" ls-remote --heads origin 2>&1) || { printf '%s\n' "$chk" > "$OUT"; logerr preflight auth; die "GitHub refused that token or can't see the repo."; } ;;
    missing) if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
               read -r -p "  Repo not found. Create it with gh as private? [y/N] " yn
               [[ $yn == [yY]* ]] && gh repo create "$(basename "${REMOTE%.git}")" --private >/dev/null 2>&1 && ok "Repo created" || die "Repo not found: $REMOTE. Create it on github.com first."
             else die "Repo not found: $REMOTE. Create it empty on github.com first, then run again."; fi ;;
    *) warn "Couldn't reach GitHub right now; continuing, pushes will keep retrying." ;;
  esac
fi
ok "GitHub reachable"

split_big

# commit unpushed work from an earlier run first
if git rev-parse --verify -q HEAD >/dev/null 2>&1; then
  last=$(cat "$ST/pushed" 2>/dev/null || true)
  if [[ $last != "$(git rev-parse HEAD)" ]]; then say "Resuming: pushing commits that didn't reach GitHub last time"; push_pending; fi
fi

# commit the removal of any newly-split files from the index
if ! git diff --cached --quiet 2>/dev/null; then git commit -q -m "store large files as parts" && push_pending; fi

if [[ -z $(git status --porcelain) ]]; then
  rm -f "$ST/bumped"
  ok "Nothing new to push. Everything is on GitHub."
  exit 0
fi

MSG="${*:-}"
if [[ -z $MSG ]]; then read -r -p "  Commit message [update $(date '+%Y-%m-%d %H:%M')]: " MSG; fi
MSG="${MSG:-update $(date '+%Y-%m-%d %H:%M')}"
bump_version

# ---------- 5. plan batches ----------
mapfile -d '' FILES < <(git ls-files -z -m -o -d --exclude-standard | sort -zu)
TOTAL=${#FILES[@]}
((TOTAL == 0)) && { ok "Nothing new to push."; exit 0; }
LIMIT=$((BATCH_MB * 1024 * 1024))
BS=(); BE=(); i=0
say "Planning batches for $TOTAL files (max $BATCH_FILES files / $BATCH_MB MB each)..."
while ((i < TOTAL)); do
  s=$i; bytes=0; cnt=0
  while ((i < TOTAL && cnt < BATCH_FILES)); do
    sz=$(stat -c %s -- "${FILES[i]}" 2>/dev/null || echo 0)
    ((cnt > 0 && bytes + sz > LIMIT)) && break
    bytes=$((bytes + sz)); cnt=$((cnt + 1)); i=$((i + 1))
  done
  BS+=("$s"); BE+=("$i")
done
NB=${#BS[@]}
ok "$NB batch(es)"
echo

# ---------- 6. commit + push each batch ----------
for ((k = 0; k < NB; k++)); do
  s=${BS[k]}; e=${BE[k]}
  batch=("${FILES[@]:s:e-s}")
  if ! git add -A -- "${batch[@]}" 2> "$OUT"; then logerr "git add batch $((k + 1))" other; cat "$OUT" >&2; die "git add failed (details in $ERRLOG)"; fi
  git diff --cached --quiet && { bar "$e" "$TOTAL" "batch $((k + 1))/$NB (no changes)"; continue; }
  label="$MSG"; ((NB > 1)) && label="$MSG (part $((k + 1))/$NB)"
  git commit -q -m "$label" || die "Commit failed."
  push_pending
  bar "$e" "$TOTAL" "batch $((k + 1))/$NB · $e/$TOTAL files"
done

# ---------- 7. done ----------
git update-ref "refs/remotes/origin/$BRANCH" HEAD 2>/dev/null && git branch -q -u "origin/$BRANCH" 2>/dev/null
rm -f "$ST/bumped"
echo
ok "All pushed to $REMOTE ($BRANCH)"
[[ -s $ERRLOG ]] && say "Errors seen along the way (all recovered) are in: $ERRLOG"
exit 0
