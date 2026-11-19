#!/bin/bash
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$T/../../.." && pwd)"
OUT="$T/out"

rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/gen" "$OUT/gen-classes"
echo "== compile OverTime (Java 8, -Werror)"
javac --release 8 -Xlint:all,-options -Werror -d "$OUT/classes" $(find "$T/stubs" -name '*.java') "$ROOT/java/OverTime.java"
javac --release 8 -Xlint:-options -nowarn -cp "$OUT/classes" -d "$OUT/classes" "$T"/harness/*.java

fails=0
echo "== Harness"
if java -cp "$OUT/classes" Harness > "$OUT/harness.log" 2>&1; then :; else echo "   crashed (see $OUT/harness.log)"; fails=$((fails + 1)); fi
grep -E "^(PASS|FAIL)" "$OUT/harness.log" | sed 's/^/   /' || true
if grep -q "^FAIL" "$OUT/harness.log"; then fails=$((fails + 1)); fi

echo "== generated code"
( cd "$ROOT" && GEN_OUT="$OUT/gen" npx vitest run java/test/overtime/generate.test.ts > "$OUT/generate.log" 2>&1 ) || { echo "   generator failed (see $OUT/generate.log)"; fails=$((fails + 1)); }
GEN=$(find "$OUT/gen" -name '*.java')
if [ -n "$GEN" ]; then
  if javac --release 8 -Xlint:all,-options -Werror -cp "$OUT/classes" -d "$OUT/gen-classes" $GEN; then
    echo "   $(echo "$GEN" | wc -l | tr -d ' ') files compile"
  else
    fails=$((fails + 1))
  fi
else
  echo "   no files generated"; fails=$((fails + 1))
fi

if [ "$fails" -gt 0 ]; then
  echo "FAILED: $fails"
  exit 1
fi
echo "ALL JAVA CHECKS PASS"
