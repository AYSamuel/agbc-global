# Brand fonts

Bricolage Grotesque and Hanken Grotesk, static instances, vendored from Google Fonts
(via the @expo-google-fonts packages) under the SIL Open Font License 1.1.

Files are named by their ttf PostScript names ON PURPOSE: the expo-font config plugin
derives the Android font family from the filename and iOS reads the embedded PostScript
name, so identical naming gives one cross-platform `fontFamily` (see docs/spec/05 and
packages/shared/src/theme). Do not rename.
