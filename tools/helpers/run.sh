#!/usr/bin/env bash
# Run helper bots headless on the Bash.tv free model.
#   tools/helpers/run.sh [-j N] [-w] brief1 brief2 ...   (names in tools/helpers/briefs/*.md)
# Each brief runs as `pi -p` in /home/bashtv/temple; its final answer goes to out/<name>.md and
# its stderr/log to out/<name>.log. Read-only by default (read, grep, find, ls); -w also gives
# bash/edit/write. -j sets how many run at once (default 2: the sandbox has ~1 GB RAM).
set -u
cd "$(dirname "$0")"
H=$PWD; ROOT=$(cd ../.. && pwd)
PI=/opt/pi-mono/node_modules/@mariozechner/pi-coding-agent/dist/cli.js
J=2; TOOLS=read,grep,find,ls
while getopts "j:w" o; do case $o in j) J=$OPTARG;; w) TOOLS=read,grep,find,ls,bash,edit,write;; esac; done
shift $((OPTIND-1))
one() {
  local name=$1 start=$(date +%s)
  echo "[$(date +%T)] start $name"
  ( cd "$ROOT" && node --max-old-space-size=200 "$PI" -ne -ns -np -e "$H/free-model.ts" --no-session \
      --provider bashtv --model free --thinking medium --tools "$TOOLS" \
      --append-system-prompt "$H/common.md" -p "$(cat "$H/briefs/$name.md")" ) >"$H/out/$name.md" 2>"$H/out/$name.log"
  echo "[$(date +%T)] done  $name exit=$? $(( $(date +%s)-start ))s $(wc -c <"$H/out/$name.md")B"
}
for b in "$@"; do
  while [ "$(jobs -rp | wc -l)" -ge "$J" ]; do sleep 2; done
  one "$b" &
  sleep 3
done
wait
echo ALL DONE
