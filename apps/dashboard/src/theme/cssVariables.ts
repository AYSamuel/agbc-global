import {
  color,
  media,
  onInk,
  palette,
  radius,
  typeScale,
  type ThemeName,
} from '@agbc/shared/theme';

/**
 * The design tokens from `packages/shared`, rendered as CSS custom properties.
 *
 * Generated rather than hand-copied: the mobile app and the dashboard read the same
 * module, so a token change lands in both and neither can quietly drift (docs/spec/24
 * §2.6). No hex is ever typed into this app's CSS or components.
 *
 * globals.css maps these onto Tailwind's theme (`@theme inline`), so `bg-card`,
 * `text-sub`, `rounded-card` and friends resolve to the same values the app uses.
 *
 * Both themes always. There is no theme picker in the dashboard yet, so it follows the
 * operating system; a stored preference can set `data-theme` on <html> later without
 * touching a single component.
 */
export function themeVariables(): string {
  return [
    `:root { color-scheme: light dark; ${brandVariables()} ${themeBlock('light')} }`,
    `@media (prefers-color-scheme: dark) { :root { ${themeBlock('dark')} } }`,
    `:root[data-theme='light'] { ${themeBlock('light')} }`,
    `:root[data-theme='dark'] { ${themeBlock('dark')} }`,
  ].join('\n');
}

/** Theme-independent: the mockup keeps these in its brand :root, identical in both. */
function brandVariables(): string {
  return declarations({
    '--t-danger': palette.red,
    '--t-success': palette.green,
    // The avatar disc (mockup `.avatar`): a fixed navy, and white lettering on top of
    // it. Brand rather than theme, because that disc is the same colour in the mockup's
    // dark strip as in its light one, and `onInk` exists for exactly this: content
    // sitting on ink, where the surface underneath never changes.
    '--t-navy': palette.navy,
    '--t-on-ink': onInk.text,
    // The gold that carries on a light surface. `05`'s contrast rule: gold itself fails
    // on light, so the pills and the guideline icon use this deeper one there and the
    // plain accent on dark. It was being typed as a hex in two components before it had
    // a name here.
    '--t-gold-deep': palette.goldDeep,
    // The message artwork's two constants (W3.1 slice 5), from the same `media` group the
    // player reads. Brand rather than theme for the reason that group records: neither
    // sits on a themed surface. The fallback cover is drawn where a picture would be, and
    // the caption pill sits on top of one, so both are identical in light and dark, and
    // the mockup's `.pl-art.none` carries no dark override either.
    '--t-art-from': media.artFrom,
    '--t-art-to': media.artTo,
    '--t-tag-bg': media.tagBg,
    '--t-radius-control': `${String(radius.control)}px`,
    '--t-radius-button': `${String(radius.button)}px`,
    '--t-radius-card': `${String(radius.card)}px`,
    '--t-radius-full': `${String(radius.full)}px`,
    // Type sizes in REM, not px. The token scale is authored in px because the mobile
    // app needs numbers, but on the web a px font-size ignores the reader's own default
    // font size, which is exactly the setting someone with low vision changes first
    // (WCAG 1.4.4). Dividing by the 16px browser default keeps the rendered size
    // identical while letting it scale.
    '--t-text-hero': rem(typeScale.hero.fontSize),
    '--t-text-section': rem(typeScale.section.fontSize),
    '--t-text-card': rem(typeScale.cardTitle.fontSize),
    '--t-text-body': rem(typeScale.body.fontSize),
    '--t-text-label': rem(typeScale.label.fontSize),
  });
}

function rem(px: number): string {
  return `${String(px / 16)}rem`;
}

function themeBlock(theme: ThemeName): string {
  const t = color[theme];
  return declarations({
    '--t-bg': t.bg,
    '--t-alt': t.alt,
    '--t-card': t.card,
    '--t-cardline': t.cardline,
    '--t-controlline': t.controlline,
    '--t-raised': t.raised,
    '--t-text': t.text,
    '--t-sub': t.sub,
    '--t-muted': t.muted,
    '--t-accent': t.accent,
    '--t-blue': t.blue,
    '--t-btn-bg': t.btnBg,
    '--t-btn-text': t.btnText,
  });
}

function declarations(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
}
