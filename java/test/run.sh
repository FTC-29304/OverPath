#!/bin/bash
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$T/../.." && pwd)"
LIB="${OVERPATH:-$ROOT/java/OverPath.java}"
TUNE="$ROOT/java/OverPathAutoTune.java"
OUT="$T/out"
QUICK="${1:-}"

rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/gen"
echo "== compile OverPath (Java 8, -Werror)"
javac --release 8 -Xlint:all,-options -Werror -d "$OUT/classes" $(find "$T/stubs" -name '*.java') "$LIB" "$TUNE"
javac --release 8 -Xlint:-options -nowarn -cp "$OUT/classes" -d "$OUT/classes" "$T"/harness/*.java

fails=0
run() {
  echo "== $*"
  local log="$OUT/$1.log"
  java -cp "$OUT/classes" "$@" > "$log" 2>&1 || { echo "   crashed (see $log)"; fails=$((fails + 1)); return; }
  grep -E "^(FAIL|MEASURED|v3 |AB )|ALL PASS|FAILED" "$log" | sed 's/^/   /' || true
  if grep -q "^FAIL" "$log"; then fails=$((fails + 1)); fi
}
run Harness
run Harness2
run Harness3
run Harness6
if [ "$QUICK" != "--quick" ]; then
  run Harness4 v3
  run Harness5
fi

echo "== generated code"
( cd "$ROOT" && GEN_OUT="$OUT/gen" npx vitest run java/test/generate.test.ts > "$OUT/generate.log" 2>&1 ) || { echo "   generator failed (see $OUT/generate.log)"; fails=$((fails + 1)); }
GEN=$(find "$OUT/gen" -name '*.java')
if [ -n "$GEN" ]; then
  javac --release 8 -Xlint:all,-options -Werror -cp "$OUT/classes" -d "$OUT/gen-classes" $GEN && echo "   $(echo "$GEN" | wc -l | tr -d ' ') files compile"
fi

if [ "$fails" -gt 0 ]; then
  echo "FAILED: $fails"
  exit 1
fi
echo "ALL JAVA CHECKS PASS"
