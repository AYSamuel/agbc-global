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
# WHAT THIS PRODUCES IS A DRESS REHEARSAL, NOT THE STORE ASSETS, and saying so
# here because the output looks finished. Run against a DEV CLIENT it captures
# three things that must not reach a listing:
#
#   1. expo-dev-client's floating menu button, a grey gear that sits over the
#      top-right of every screen. It does not exist in a release build, and it is
#      the kind of thing that reaches a store page precisely because it looks
#      like part of the app.
#   2. Whatever the device's status bar happens to hold: a Gmail badge, the
#      charging bolt, the real time.
#   3. SEED CONTENT, because a dev build points at the local Supabase. The
#      testimonies and names are fictional.
#
# The shippable set is captured from an EAS preview or production build pointed
# at production, AFTER the launch content exists (`22` §2: verses queued in each
# language; `22` §3: real testimonies from the Founding Members programme).
# Until then this run is worth having: it proves the matrix and the layouts, and
# it is how the sheet-covering-Nigeria bug was found.
#
# APPLE MODE (W4.17): `STORE=apple` captures the App Store sets from the same
# Android devices, because there is no iPhone or iPad in the project. React Native
# draws the same screens on both platforms, so what differs is the frame, and the
# frame is what this mode controls:
#
#   THE EXACT PIXEL SIZE APPLE ACCEPTS, not a resize afterwards. The display is
#   set to 1320 wide (iPhone 6.9") or 2064 wide (iPad 13") at the density that
#   gives the iPhone's 440pt or the iPad's 1032pt layout width, so the app lays
#   out at the width it will be judged at instead of being stretched to it.
#
#   NO ANDROID CHROME. The display is made taller by exactly the status bar and
#   navigation bar, measured from `dumpsys window` after the resize (they are dp,
#   so they move with density), and both strips are cropped off. What is left is
#   the app at 1320x2868 or 2064x2752. An Android status bar or back button on an
#   App Store page is imagery of another platform, which review rejects.
#
#   NO ALPHA CHANNEL. screencap writes RGBA and App Store Connect refuses any image
#   with transparency, so every capture is re-encoded as rgb24 by ffmpeg.
#
#   TEXT AT 1.0 while capturing, whatever the device is set to, because that is the
#   default an iPhone ships with. The display size, density and text scale are put
#   back on exit, including when the run fails half way.
#
# Usage:  bash scripts/capture-store-screenshots.sh [output-dir]
#         STORE=apple bash scripts/capture-store-screenshots.sh [output-dir]
#         LOCALES="en" STORE=apple bash scripts/capture-store-screenshots.sh
# Needs:  one device attached and the app installed (Metro only for a dev client);
#         ffmpeg on PATH for STORE=apple.
set -u

ADB="${ADB:-/c/Users/AY/AppData/Local/Android/Sdk/platform-tools/adb.exe}"
FFMPEG="${FFMPEG:-ffmpeg}"
OUT="${1:-docs/store/screenshots}"
STORE="${STORE:-play}"
PKG=com.oami.agbcapp
SCHEME=agbcglobal
export MSYS_NO_PATHCONV=1

case "$STORE" in
  play | apple) ;;
  *) echo "STORE must be play or apple, not '$STORE'"; exit 1 ;;
esac
if [ "$STORE" = apple ]; then
  command -v "$FFMPEG" >/dev/null 2>&1 || { echo "ffmpeg not found (needed for STORE=apple)"; exit 1; }
fi

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

# Where this run's files go: phone/ and tablet/ for Play, the Apple display name for
# the App Store, so the two sets never overwrite each other.
DIR=$FORM

# Prints "<status bar px> <navigation bar px>" for the display as it is right now.
insets() {
  local d top nav
  d=$("$ADB" -s "$DEVICE" shell dumpsys window | tr -d '\r')
  top=$(printf '%s\n' "$d" | grep -m1 -oE 'type=statusBars frame=\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]' \
    | grep -oE '[0-9]+' | sed -n '4p')
  nav=$(printf '%s\n' "$d" | grep -m1 -oE 'type=navigationBars frame=\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]' \
    | grep -oE '[0-9]+' | sed -n '2p;4p' | paste -sd' ' | awk '{print $2 - $1}')
  echo "${top:-0} ${nav:-0}"
}

if [ "$STORE" = apple ]; then
  if [ "$FORM" = phone ]; then
    TW=1320; TH=2868; TD=480; DIR=iphone-6.9   # 1320 * 160 / 480 = 440dp, the iPhone's 440pt
  else
    TW=2064; TH=2752; TD=320; DIR=ipad-13      # 2064 * 160 / 320 = 1032dp, the iPad's 1032pt
  fi

  # Remember any override the device already had, so restoring does not quietly
  # replace somebody's chosen display size with the physical one.
  ORIG_SIZE=$("$ADB" -s "$DEVICE" shell wm size | tr -d '\r' | awk '/Override/{print $NF}')
  ORIG_DENSITY=$("$ADB" -s "$DEVICE" shell wm density | tr -d '\r' | awk '/Override/{print $NF}')
  ORIG_FONT=$("$ADB" -s "$DEVICE" shell settings get system font_scale | tr -d '\r')
  ORIG_AUTOROTATE=$("$ADB" -s "$DEVICE" shell settings get system accelerometer_rotation | tr -d '\r')
  ORIG_ROTATION=$("$ADB" -s "$DEVICE" shell settings get system user_rotation | tr -d '\r')
  restore() {
    if [ -n "$ORIG_SIZE" ]; then "$ADB" -s "$DEVICE" shell wm size "$ORIG_SIZE"; else "$ADB" -s "$DEVICE" shell wm size reset; fi
    if [ -n "$ORIG_DENSITY" ]; then "$ADB" -s "$DEVICE" shell wm density "$ORIG_DENSITY"; else "$ADB" -s "$DEVICE" shell wm density reset; fi
    "$ADB" -s "$DEVICE" shell settings put system font_scale "$ORIG_FONT"
    "$ADB" -s "$DEVICE" shell settings put system user_rotation "$ORIG_ROTATION"
    "$ADB" -s "$DEVICE" shell settings put system accelerometer_rotation "$ORIG_AUTOROTATE"
    echo "restored: display size ${ORIG_SIZE:-physical}, density ${ORIG_DENSITY:-physical}, font_scale $ORIG_FONT, rotation $ORIG_ROTATION (auto $ORIG_AUTOROTATE)"
  }
  trap restore EXIT

  # PORTRAIT, LOCKED. The Tab S10+ normally sits in landscape, and the App Store sets
  # are portrait; a resize applied to a rotated display comes back sideways, and the
  # crop would then take the wrong axis. A phone is unaffected by this.
  "$ADB" -s "$DEVICE" shell settings put system accelerometer_rotation 0
  "$ADB" -s "$DEVICE" shell settings put system user_rotation 0
  "$ADB" -s "$DEVICE" shell settings put system font_scale 1.0
  "$ADB" -s "$DEVICE" shell wm density "$TD"
  "$ADB" -s "$DEVICE" shell wm size "${TW}x${TH}"
  sleep 5
  read -r TOP NAV <<<"$(insets)"
  "$ADB" -s "$DEVICE" shell wm size "${TW}x$(( TH + TOP + NAV ))"
  sleep 5
  # The bars are measured again at the final size. If they moved, the crop would
  # cut into the app or leave a strip of Android behind, so stop rather than guess.
  read -r TOP2 NAV2 <<<"$(insets)"
  if [ "$TOP2" != "$TOP" ] || [ "$NAV2" != "$NAV" ]; then
    echo "system bars moved after the resize ($TOP/$NAV -> $TOP2/$NAV2); not capturing"
    exit 1
  fi
  W=$TW; H=$(( TH + TOP + NAV ))
  # Confirm the frame really is portrait before spending a run on it.
  PROBE=$("$ADB" -s "$DEVICE" shell dumpsys window displays | tr -d '\r' \
    | grep -m1 -oE 'cur=[0-9]+x[0-9]+' | cut -d= -f2)
  if [ "$PROBE" != "${W}x${H}" ]; then
    echo "display reports ${PROBE:-nothing}, expected ${W}x${H} (rotated?); not capturing"
    exit 1
  fi
  echo "apple: display ${W}x${H} @ ${TD}, cropping ${TOP}px status bar and ${NAV}px navigation bar -> ${TW}x${TH}"
fi

mkdir -p "$OUT/$DIR"

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

# Drag a node to the bottom of the screen, for the map's bottom sheet.
swipeDown() {
  local label="$1" tree b x1 y1 x2 y2 cx
  tree=$(dump)
  b=$(printf '%s' "$tree" | tr '<' '
'       | grep -E "content-desc=\"[^\"]*${label}"       | grep -oE 'bounds="[[][0-9]+,[0-9]+[]][[][0-9]+,[0-9]+[]]"' | head -1)
  if [ -z "$b" ]; then echo "   ! sheet handle not on screen"; return 1; fi
  set -- $(printf '%s' "$b" | grep -oE '[0-9]+')
  x1=$1; y1=$2; x2=$3; y2=$4
  cx=$(( (x1+x2)/2 ))
  "$ADB" -s "$DEVICE" shell input swipe $cx $(( (y1+y2)/2 )) $cx $(( H - 140 )) 500
  sleep 2
}

open() {  # deep-link to a route and settle
  "$ADB" -s "$DEVICE" shell am start -a android.intent.action.VIEW \
    -d "$SCHEME://$1" "$PKG" >/dev/null 2>&1
  sleep 3
}

shot() {  # shot <locale> <name>
  local path="$OUT/$DIR/$1-$2.png"
  if [ "$STORE" = apple ]; then
    local raw="$OUT/$DIR/.raw-$1-$2.png"
    "$ADB" -s "$DEVICE" exec-out screencap -p > "$raw"
    "$FFMPEG" -loglevel error -y -i "$raw" -vf "crop=${TW}:${TH}:0:${TOP}" -pix_fmt rgb24 "$path" \
      && rm -f "$raw" \
      || { echo "   ! ffmpeg could not crop $raw"; return 1; }
  else
    "$ADB" -s "$DEVICE" exec-out screencap -p > "$path"
  fi
  echo "   $path"
}

# The language picker's own list uses each language's AUTONYM (i18n/index.ts
# LANGUAGE_AUTONYMS), which is the same word whatever the current language, so
# these labels work no matter which language we are switching FROM.
declare -A AUTONYM=( [en]=English [de]=Deutsch [nl]=Nederlands [fr]=Français )

# The map's zoom control is an icon button, so its only handle is its accessible
# name, and that IS translated (family:mapZoomOut). Tapping the English label
# would silently do nothing in the other three languages and quietly produce the
# Europe-only framing this zoom exists to avoid.
# The map's bottom sheet, by its accessible name (family:mapSheetHandle), which is
# translated like everything else. A distinctive fragment rather than the whole
# sentence, so a moved comma does not break the match.
declare -A SHEET=( [en]="swipe to expand" [de]="zum Auf- oder Zuklappen" [nl]="veeg om uit of in" [fr]="glissez pour ouvrir" )

switchLanguage() {
  local target="$1"
  open "settings/language" || return 1
  tapText "${AUTONYM[$target]}" || return 1
  sleep 2
}

# The five screens that tell the story, in the order the listing tells it.
capture_set() {
  local loc="$1"
  # Home between every screen. A deep link to a tab route does NOT navigate while
  # a pushed screen is on top: reached from My Rhythm, `family?tab=map` left the
  # app exactly where it was and the run photographed the wrong screen.
  open "" ;            shot "$loc" 1-home
  open "watch" ;       shot "$loc" 2-watch
  open "" >/dev/null
  open "family" ;      shot "$loc" 3-family
  # COLLAPSE THE SHEET BEFORE PHOTOGRAPHING THE MAP. At rest it covers the lower
  # third of the screen, which is exactly where Nigeria is, so the shot showed
  # three European pins beside the words "many nations" (Ayo spotted it,
  # 2026-09-03). Dragging it down reveals all four, Ogbomosho included and ringed
  # as the member's own branch. Zooming out was tried first and is worse: the
  # visible band sits north of Nigeria, so that pin stays hidden while the others
  # shrink to specks.
  open "" >/dev/null
  open "family?tab=map"
  swipeDown "${SHEET[$loc]}"
  shot "$loc" 4-map
  open "" >/dev/null
  open "rhythm" ;      shot "$loc" 5-rhythm
}

# LOCALES narrows a run (LOCALES=en), so one language can be looked at before the
# other three are spent on a framing that turns out wrong.
# Tap a node whose text or content-desc is EXACTLY the label. tapText matches a
# prefix, which is wrong where a container's accessible name starts with its
# child's label: the Watch segment is named "Video or audio" and holds "Video".
tapExact() {
  local label="$1" b x1 y1 x2 y2
  b=$(dump | tr '<' '\n' \
      | grep -E "(text|content-desc)=\"${label}\"" \
      | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1)
  if [ -z "$b" ]; then echo "   ! '$label' not on screen"; return 1; fi
  set -- $(printf '%s' "$b" | grep -oE '[0-9]+')
  x1=$1; y1=$2; x2=$3; y2=$4
  "$ADB" -s "$DEVICE" shell input tap $(( (x1+x2)/2 )) $(( (y1+y2)/2 ))
  sleep 3
}

declare -A VIDEO=( [en]=Video [de]=Video [nl]=Video [fr]="Vidéo" )
declare -A SHARE=( [en]=Share [de]=Teilen [nl]=Delen [fr]=Partager )

# THE APP STORE TELLS A DIFFERENT FIVE (W4.17, 2026-09-15), chosen against
# production as it was on launch day rather than the Play set's story:
#   - Family and Rhythm are left out because production has no testimonies yet
#     and a new member has no rhythm, so both screens were empty states ("Be the
#     first to share", "Your rhythm starts here"). An empty state on a store page
#     sells an empty app. They come back once `22` §3's launch content exists.
#   - Watch is photographed on VIDEO, not wherever the session left the segment:
#     the first run caught the Audio half, two messages and a screen of nothing.
#   - Share as a picture is 1.0.2's headline, and the verse card has real content
#     every day.
#   - Events is not here because none was scheduled, and Academy is not because it
#     prints prices paid on the website and a "coming soon" badge, both things App
#     Review reads closely.
capture_apple_set() {
  local loc="$1"
  open "" ;            shot "$loc" 1-home
  open "watch"
  tapExact "${VIDEO[$loc]}"
  shot "$loc" 2-watch
  open "" >/dev/null
  # The verse card's Share opens the preview sheet (SHARE-PREVIEW). Back closes it.
  if tapExact "${SHARE[$loc]}"; then
    shot "$loc" 3-share
    "$ADB" -s "$DEVICE" shell input keyevent KEYCODE_BACK
    sleep 2
  fi
  open "" >/dev/null
  open "family?tab=map"
  swipeDown "${SHEET[$loc]}"
  shot "$loc" 4-map
  open "" >/dev/null
  open "branches" ;    shot "$loc" 5-branches
}

for loc in ${LOCALES:-en de nl fr}; do
  echo "-- $loc"
  switchLanguage "$loc" || { echo "   ! could not switch to $loc, skipping"; continue; }
  if [ "$STORE" = apple ]; then capture_apple_set "$loc"; else capture_set "$loc"; fi
done

# Leave the device in English rather than wherever the loop ended.
switchLanguage en >/dev/null 2>&1

echo
echo "done. $(ls "$OUT/$DIR" | wc -l) files in $OUT/$DIR"
if [ "$STORE" = apple ]; then
  echo "App Store Connect wants iPhone 6.9\" and iPad 13\": run this again on the other device."
else
  echo "Play wants phone, 7\" tablet and 10\" tablet: run this again on the other device."
fi
