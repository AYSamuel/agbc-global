import Svg, { Path, type SvgProps } from 'react-native-svg';

// Stroke-based, currentColor-style icons at 1.8 stroke per docs/spec/05, matching the
// website's glyph vocabulary. Grows as screens need glyphs; never import an icon font.

export interface IconProps extends SvgProps {
  size?: number;
  color: string;
}

function base({ size = 20, color, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M15 18l-6-6 6-6" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M12 2l2.9 6.3 6.6.6-5 4.5 1.5 6.6L12 16.9 6 20l1.5-6.6-5-4.5 6.6-.6z" />
    </Svg>
  );
}
