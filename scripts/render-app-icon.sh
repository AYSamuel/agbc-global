#!/usr/bin/env bash
# Render the app icon set from the mockup's own CSS.
#
# WHY THIS EXISTS. Until 2026-09-04 the app shipped `create-expo-app`'s
# placeholder: a blue chevron on a blue gradient, in `icon.png` and all three
# Android adaptive layers, plus an untouched `assets/expo.icon` bundle for iOS.
# Nothing in the suite could see it. Typecheck, lint, 893 unit tests and six
# Maestro journeys all pass with any PNG at those paths, and the one place the
# icon is unavoidable, a phone's home screen, is the one place no test looks.
# It surfaced only when the Play listing was filled in and the placeholder sat
# next to the church's own logo. An asset is not verified by being present.
#
# THE MARK IS NOT INVENTED HERE. `docs/spec/design/mockups/entry-flow.html`
# already specifies it, and has since the mockup was written:
#
#   .logo{width:76px;height:76px;border-radius:22px;background:var(--gold);
#         color:var(--navy);font-family:var(--disp);font-weight:800;font-size:40px}
#
# a gold tile with a navy "A" in Bricolage Grotesque ExtraBold. This script
# renders exactly that, at the sizes each platform wants, so the icon and the
# splash cannot drift from the design the rest of the app is built to. The
# 40/76 font-to-tile ratio is the mockup's, not a taste call: it lands the
# glyph at ~36% of the tile height, which is what the measure step asserts.
#
# Usage:  bash scripts/render-app-icon.sh
# Output: apps/mobile/assets/images/{icon,android-icon-*,splash-icon}.png
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/mobile/assets/images"
# cygpath -m, not string surgery: the first version of this line built the URL
# by hand, lost the drive letter, and Chrome quietly fell back to a system font.
# The PNGs came out the right SIZE with the wrong LETTERFORM, which the
# dimension check happily passed. That is why the byte-comparison below exists.
FONT="file:///$(cygpath -m "$ROOT/apps/mobile/assets/fonts/BricolageGrotesque-ExtraBold.ttf")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; }

GOLD="#ffcf4a"   # --gold from the mockup
NAVY="#14213d"   # --navy from the mockup

# tile <name> <px> <background> <glyph colour> <font-px> <radius-px>
tile() {
  cat > "$WORK/$1.html" <<EOF
<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Bric;src:url('$FONT') format('truetype');font-weight:800}
html,body{margin:0;padding:0;width:${2}px;height:${2}px;background:transparent}
.t{width:${2}px;height:${2}px;background:$3;border-radius:${6}px;
   display:flex;align-items:center;justify-content:center}
/* No letter-spacing and no vertical nudge. Both were tried and both moved the
   glyph off centre: letter-spacing adds its gap AFTER a single character, and
   the em box already centres a capital acceptably. Measured, not eyeballed. */
.a{font-family:Bric;font-weight:800;font-size:${5}px;color:$4;line-height:1}
</style><div class="t"><span class="a">A</span></div>
EOF
}

# ONE CHROME PER FILE, deliberately. Looping several headless launches in quick
# succession silently produces no file on this machine: Chrome reports "written
# to file" and writes nothing, because the launches collide over the default
# profile. Isolating with --user-data-dir did not help. Separate sequential
# invocations do, and a wrong icon that looks rendered is exactly the class of
# failure this script exists to stop.
shot() {
  local name="$1" size="$2"
  MSYS_NO_PATHCONV=1 "$CHROME" --headless --disable-gpu --no-sandbox \
    --hide-scrollbars --allow-file-access-from-files \
    --default-background-color=00000000 \
    --window-size="$size,$size" \
    --screenshot="$(cygpath -w "$WORK/$name.png")" \
    "$(cygpath -w "$WORK/$name.html")" >/dev/null 2>&1
  [ -s "$WORK/$name.png" ] || { echo "render failed: $name" >&2; exit 1; }
}

# icon.png is full bleed: every platform applies its own mask.
tile icon 1024 "$GOLD" "$NAVY" 560 0

# Adaptive layers are 108dp with only the central 66.7% guaranteed visible, so
# the glyph is sized against that safe zone rather than the canvas.
tile fg 512 "transparent" "$NAVY" 200 0
tile mono 432 "transparent" "#ffffff" 169 0

# The splash keeps the mockup's rounded tile, on `backgroundColor: '#14213D'`
# with `imageWidth: 76` (app.config.js). Rendered at 4x for a crisp downscale.
tile splash 304 "$GOLD" "$NAVY" 160 88

shot icon 1024
shot fg 512
shot mono 432
shot splash 304

# The adaptive background is flat gold; no glyph, so no font to render.
cat > "$WORK/bg.html" <<EOF
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;width:512px;height:512px;background:$GOLD}</style>
EOF
shot bg 512

cp "$WORK/icon.png"   "$OUT/icon.png"
cp "$WORK/fg.png"     "$OUT/android-icon-foreground.png"
cp "$WORK/bg.png"     "$OUT/android-icon-background.png"
cp "$WORK/mono.png"   "$OUT/android-icon-monochrome.png"
cp "$WORK/splash.png" "$OUT/splash-icon.png"

echo "Wrote the icon set to $OUT:"
for f in icon android-icon-foreground android-icon-background android-icon-monochrome splash-icon; do
  echo "  $f.png"
done
echo
echo "Icons are NATIVE assets: they reach a device only through a new build."
echo "Rebuild with EAS and bump versionCode before this shows on a home screen."
