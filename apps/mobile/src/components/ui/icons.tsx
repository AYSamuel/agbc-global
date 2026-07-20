import Svg, { Circle, Path, type SvgProps } from 'react-native-svg';

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

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
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

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

// The five tab glyphs, path data verbatim from the mockup's .tabbar SVGs.

export function HomeTabIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M3 11l9-8 9 8" />
      <Path d="M5 10v10h14V10" />
    </Svg>
  );
}

export function WatchTabIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M10 8.5l6 3.5-6 3.5z" fill={props.color} stroke="none" />
    </Svg>
  );
}

export function FamilyTabIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Circle cx={9} cy={9} r={3} />
      <Path d="M15.5 8.5a2.6 2.6 0 1 0 0 4" />
      <Path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <Path d="M15 19a5.2 5.2 0 0 1 5.5-4" />
    </Svg>
  );
}

export function GiveTabIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Path d="M20.8 8.6a3.2 3.2 0 0 0-4.5 0L12 12.9 7.7 8.6a3.2 3.2 0 1 0-4.5 4.5l8.8 8.8 8.8-8.8a3.2 3.2 0 0 0 0-4.5z" />
    </Svg>
  );
}

export function MoreTabIcon(props: IconProps) {
  return (
    <Svg {...base({ ...props, strokeWidth: 2.1 })}>
      <Circle cx={5} cy={12} r={1.4} fill={props.color} stroke="none" />
      <Circle cx={12} cy={12} r={1.4} fill={props.color} stroke="none" />
      <Circle cx={19} cy={12} r={1.4} fill={props.color} stroke="none" />
    </Svg>
  );
}

export function UpdateIcon(props: IconProps) {
  return (
    <Svg {...base(props)}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 16V8" />
      <Path d="M8 12l4-4 4 4" />
    </Svg>
  );
}
