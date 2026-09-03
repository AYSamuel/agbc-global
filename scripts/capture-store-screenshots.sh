#!/usr/bin/env bash
# Captures the Play store screenshot matrix from a REAL device (W4.8 slice 6).
#
# Play wants phone, 7" tablet and 10" tablet, per locale, and the app ships four
# languages, so the matrix is 5 screens x 4 languages x however many devices are
# to hand. Doing that by hand is forty-odd captures and the certainty that one
# language ends up with an English screenshot nobody notices until a German
# member sees it on the store page.
#
# THREE THINGS THIS SCRIPT KNOWS THAT COST TIME TO LEARN, all recorded because
# each one produced a confident wrong answer first:
#
#   MSYS_NO_PATHCONV=1 IS NOT OPTIONAL. In Git Bash, `adb shell` arguments that
#   look like paths (/sdcard/ui.xml, /dev/tty) are silently rewritten to Windows
#   paths, so `uiautomator dump` writes nothing and every later grep "passes" by
#   finding nothing in an empty file.
#
#   TAP WHAT THE TREE SAYS, NOT WHAT THE LAST RUN SAID. Bounds move between
#   languages, because German is longer. Every tap re-dumps the tree first.
#
#   MenuLabel RENDERS UPPERCASE. `textTransform` is applied before uiautomator
#   sees it, so a search for "What we collect" finds nothing while
#   "WHAT WE COLLECT" is on screen.
#
# Usage:  bash scripts/capture-store-screenshots.sh [output-dir]
# Needs:  one device attached, Metro running, the app installed.
set -u

ADB="${ADB:-/c/Users/AY/AppData/Local/Android/Sdk/platform-tools/adb.exe}"
OUT="${1:-docs/store/screenshots}"
PKG=com.oami.agbcapp
SCHEME=agbcglobal
export MSYS_NO_PATHCONV=1

command -v "$ADB" >/dev/null 2>&1 || { echo "adb not found at $ADB"; exit 1; }
DEVICES=$("$ADB" devices | awk 'NR>1 && $2=="device"{print $1}')
[ -z "$DEVICES" ] && { echo "No device attached. Plug in the phone or the tablet."; exit 1; }
DEVICE=$(echo "$DEVICES" | head -1)
MODEL=$("$ADB" -s "$DEVICE" shell getprop ro.product.model | tr -d '\r')
SIZE=$("$ADB" -s "$DEVICE" shell wm size | tr -d '\r' | awk '{print $NF}')
echo "device: $MODEL ($SIZE)"

# Smallest width decides the form factor, exactly as `sw600dp` does and as
# src/lib/layout.ts does, so a tablet in portrait is still a tablet.
DENSITY=$("$ADB" -s "$DEVICE" shell wm density | tr -d '\r' | awk '{print $NF}')
W=${SIZE%x*}; H=${SIZE#*x}
SMALLEST=$(( (W < H ? W : H) * 160 / DENSITY ))
if [ "$SMALLEST" -ge 600 ]; then FORM=tablet; else FORM=phone; fi
echo "smallest width: ${SMALLEST}dp -> $FORM"

mkdir -p "$OUT/$FORM"

dump() {
  "$ADB" -s "$DEVICE" exec-out uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  "$ADB" -s "$DEVICE" shell cat /sdcard/ui.xml
}

# Tap a node by its text or content-desc. Re-reads the tree every time: bounds
# move between languages and between form factors.
tapText() {
  local label="$1" tree b x1 y1 x2 y2
  tree=$(dump)
  b=$(printf '%s' "$tree" | tr '<' '\n' \
      | grep -E "(text|content-desc)=\"[^\"]*${label}" \
      | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1)
  if [ -z "$b" ]; then echo "   ! '$label' not on screen"; return 1; fi
  set -- $(printf '%s' "$b" | grep -oE '[0-9]+')
  x1=$1; y1=$2; x2=$3; y2=$4
  "$ADB" -s "$DEVICE" shell input tap $(( (x1+x2)/2 )) $(( (y1+y2)/2 ))
  sleep 2
}

open() {  # deep-link to a route and settle
  "$ADB" -s "$DEVICE" shell am start -a android.intent.action.VIEW \
    -d "$SCHEME://$1" "$PKG" >/dev/null 2>&1
  sleep 3
}

shot() {  # shot <locale> <name>
  local path="$OUT/$FORM/$1-$2.png"
  "$ADB" -s "$DEVICE" exec-out screencap -p > "$path"
  echo "   $path"
}

# The language picker's own list uses each language's AUTONYM (i18n/index.ts
# LANGUAGE_AUTONYMS), which is the same word whatever the current language, so
# these labels work no matter which language we are switching FROM.
declare -A AUTONYM=( [en]=English [de]=Deutsch [nl]=Nederlands [fr]=Français )

switchLanguage() {
  local target="$1"
  open "settings/language" || return 1
  tapText "${AUTONYM[$target]}" || return 1
  sleep 2
}

# The five screens that tell the story, in the order the listing tells it.
capture_set() {
  local loc="$1"
  open "" ;            shot "$loc" 1-home
  open "watch" ;       shot "$loc" 2-watch
  open "family" ;      shot "$loc" 3-family
  open "family?tab=map" ; shot "$loc" 4-map
  open "rhythm" ;      shot "$loc" 5-rhythm
}

for loc in en de nl fr; do
  echo "-- $loc"
  switchLanguage "$loc" || { echo "   ! could not switch to $loc, skipping"; continue; }
  capture_set "$loc"
done

# Leave the device in English rather than wherever the loop ended.
switchLanguage en >/dev/null 2>&1

echo
echo "done. $(ls "$OUT/$FORM" | wc -l) files in $OUT/$FORM"
echo "Play wants phone, 7\" tablet and 10\" tablet: run this again on the other device."
