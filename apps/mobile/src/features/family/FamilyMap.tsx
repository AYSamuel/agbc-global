import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import {
  fontFamily,
  mapPinPalette,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { LocateIcon, MinusIcon, PlusIcon } from '@/components/ui';
import { useTheme } from '@/theme';

import { initials, joinMeta } from './format';
import {
  applyView,
  branchColorAt,
  fitBranches,
  IDENTITY_VIEW,
  landPath,
  landTransform,
  placeBranches,
  zoomView,
  type BranchPoint,
  type MapView,
  type MapViewport,
} from './mapProjection';
import type { TestimonyFeedItem } from './queries';
import { useRelativeAgeLabel } from './useRelativeAgeLabel';

// FAMILY > Map (docs/spec/09, ADR 0009): a full-height world canvas: real Natural
// Earth coastline, branch pins coloured per nation, recent testimony pins in their
// branch's colour, floating zoom + locate controls, and a swipeable "family,
// lately" sheet. One finger pans, two fingers pinch-zoom (buttons zoom too), and
// the sheet drags down to reveal the whole map. Branch pins are not yet tappable
// to BRANCH-INFO (that screen is W1.7); testimony pins and sheet rows open
// TESTIMONY-DETAIL.

const BRANCH_PIN = 6.5;
const HOME_HALO = 12;
const SHEET_ROWS = 3;
// How much of the sheet stays on screen when it is swiped down: the grab handle
// and the title, enough to grab and pull back up.
const SHEET_PEEK = 54;

function clampNum(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function touchDistance(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

// Gold is light enough to need dark text on it; the other pin colours are dark
// enough for white (mockup .mrow2 .a vs .a.b).
function onPinColor(color: string): string {
  return color === palette.gold ? palette.navy : onInk.text;
}

function SheetRow({
  testimony,
  branchName,
  color,
  onPress,
}: {
  testimony: TestimonyFeedItem;
  branchName: string | null;
  color: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const age = useRelativeAgeLabel(testimony.created_at);
  const name = testimony.author_name ?? t('family:aMember');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joinMeta([name, branchName, testimony.body])}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {/* Mockup .mrow2 .a: a colour-coded rounded avatar in the branch's colour. */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 12,
            color: onPinColor(color),
          }}
        >
          {initials(testimony.author_name) || '✦'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        {/* Mockup .mrow2 .nn: the name in 700, the branch as a muted 600 span. */}
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 13,
            color: colors.text,
          }}
        >
          {name}
          {branchName ? (
            <Text
              style={{
                fontFamily: fontFamily.body.semiBold,
                color: colors.muted,
              }}
            >
              {' · '}
              {branchName}
            </Text>
          ) : null}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: colors.muted,
            marginTop: 1,
          }}
        >
          {testimony.body}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 11,
          color: colors.muted,
        }}
      >
        {age}
      </Text>
    </Pressable>
  );
}

function ZoomButton({
  label,
  Icon,
  onPress,
}: {
  label: string;
  Icon: typeof PlusIcon;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon size={19} color={colors.text} />
    </Pressable>
  );
}

export function FamilyMap({
  branches,
  homeBranchId,
  testimonies,
  branchNames,
  onOpenTestimony,
}: {
  branches: BranchPoint[];
  homeBranchId: string | null;
  testimonies: TestimonyFeedItem[];
  branchNames: Record<string, string>;
  onOpenTestimony: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [canvas, setCanvas] = useState<MapViewport>({ width: 0, height: 0 });
  const [view, setView] = useState<MapView>(IDENTITY_VIEW);
  const [sheetHeight, setSheetHeight] = useState(0);

  const branchesKey = branches.map((b) => b.id).join(',');
  // A Map so .get returns `string | undefined` honestly (colorFor supplies the
  // fallback); a Record would type the access as always-present.
  const colorByBranch = new Map<string, string>();
  branches.forEach((b, i) => {
    colorByBranch.set(b.id, branchColorAt(i, mapPinPalette));
  });
  const colorFor = (branchId: string): string =>
    colorByBranch.get(branchId) ?? palette.gold;

  // Frame the branches once the canvas is measured, and again only if its size
  // or the branch set changes; the gestures/buttons mutate `view` freely without
  // this resetting them (the ref guard makes the effect idempotent).
  const fitKey = `${String(canvas.width)}x${String(canvas.height)}:${branchesKey}`;
  const lastFit = useRef('');
  useEffect(() => {
    if (canvas.width > 0 && lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      setView(fitBranches(branches, canvas));
    }
  }, [fitKey, branches, canvas]);

  // Gesture wiring reads the latest view/canvas through refs so the responder is
  // created ONCE (a memo), not rebuilt on every pan frame. The refs are written
  // in effects, never during render.
  //
  // The two React Compiler rules below are disabled for this block ON PURPOSE:
  // PanResponder handlers read these refs at GESTURE time, never during render,
  // but the compiler cannot see that the closures run post-render, so it flags
  // the reads (`refs`) and declines to memoize the responder
  // (`preserve-manual-memoization`). This is the canonical React Native gesture
  // pattern; the runtime behaviour is correct.
  /* eslint-disable react-hooks/refs, react-hooks/preserve-manual-memoization */
  const viewRef = useRef(view);
  const canvasRef = useRef(canvas);
  const gestureStart = useRef({ view: IDENTITY_VIEW, dist: 0 });
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  const mapResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (
          _e: GestureResponderEvent,
          g: PanResponderGestureState,
        ) =>
          Math.abs(g.dx) > 3 ||
          Math.abs(g.dy) > 3 ||
          g.numberActiveTouches === 2,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          gestureStart.current.view = viewRef.current;
          gestureStart.current.dist = touchDistance(e.nativeEvent.touches);
        },
        onPanResponderMove: (
          e: GestureResponderEvent,
          g: PanResponderGestureState,
        ) => {
          const touches = e.nativeEvent.touches;
          const start = gestureStart.current;
          if (touches.length >= 2) {
            // Pinch: begin a fresh baseline the moment the second finger lands.
            if (start.dist === 0) {
              start.dist = touchDistance(touches);
              start.view = viewRef.current;
              return;
            }
            const factor = touchDistance(touches) / start.dist;
            setView(zoomView(start.view, factor, canvasRef.current));
          } else {
            // Pan: translate from the view captured at grant.
            start.dist = 0;
            setView({
              scale: start.view.scale,
              tx: start.view.tx + g.dx,
              ty: start.view.ty + g.dy,
            });
          }
        },
      }),
    [],
  );

  // Swipeable sheet: a translateY that snaps between expanded (0) and swiped-down
  // (maxDown, leaving SHEET_PEEK on screen so the whole map shows).
  const sheetY = useMemo(() => new Animated.Value(0), []);
  const sheetYValue = useRef(0);
  const sheetDragStart = useRef(0);
  useEffect(() => {
    const id = sheetY.addListener(({ value }) => {
      sheetYValue.current = value;
    });
    return () => {
      sheetY.removeListener(id);
    };
  }, [sheetY]);
  // maxDown changes with the measured sheet height; the responder reads it live
  // through the ref so the single created responder always clamps correctly.
  const maxDown = Math.max(sheetHeight - SHEET_PEEK, 0);
  const maxDownRef = useRef(maxDown);
  useEffect(() => {
    maxDownRef.current = maxDown;
  }, [maxDown]);
  const sheetResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _e: GestureResponderEvent,
          g: PanResponderGestureState,
        ) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          sheetDragStart.current = sheetYValue.current;
        },
        onPanResponderMove: (
          _e: GestureResponderEvent,
          g: PanResponderGestureState,
        ) => {
          sheetY.setValue(
            clampNum(sheetDragStart.current + g.dy, 0, maxDownRef.current),
          );
        },
        onPanResponderRelease: (
          _e: GestureResponderEvent,
          g: PanResponderGestureState,
        ) => {
          const current = clampNum(
            sheetDragStart.current + g.dy,
            0,
            maxDownRef.current,
          );
          // Fling or past halfway settles to the nearer end.
          const target =
            g.vy > 0.5 || (g.vy > -0.5 && current > maxDownRef.current / 2)
              ? maxDownRef.current
              : 0;
          Animated.spring(sheetY, {
            toValue: target,
            useNativeDriver: true,
            bounciness: 2,
          }).start();
        },
      }),
    [sheetY],
  );
  /* eslint-enable react-hooks/refs, react-hooks/preserve-manual-memoization */

  // The land only depends on the canvas (zoom rides the SVG transform), so it is
  // rebuilt on resize, not on every zoom step. ~50KB of path data: worth memoing.
  const land = useMemo(
    () => (canvas.width > 0 ? landPath(canvas) : ''),
    [canvas],
  );

  // Branch pins only: a testimony's only location is its branch, so separate
  // testimony pins just cluster on (and near) the branch pins and read as extra
  // branches. The "family, lately" sheet is the testimony surface instead.
  const branchPins = canvas.width > 0 ? placeBranches(branches, canvas) : [];

  const hasSheet = testimonies.length > 0;
  // Controls sit above the sheet's expanded footprint so they never hide behind
  // it; when the sheet is swiped down they simply float a little higher.
  const controlsBottom =
    hasSheet && sheetHeight > 0 ? sheetHeight + spacing.md : spacing.lg;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t('family:mapSummary', {
        branches: branches.length,
        count: testimonies.length,
      })}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setCanvas({ width, height });
      }}
      style={{ flex: 1, backgroundColor: colors.mapSea, overflow: 'hidden' }}
    >
      {/* Gesture surface, behind the sheet + controls, so their touches win. */}
      <View style={StyleSheet.absoluteFill} {...mapResponder.panHandlers}>
        {canvas.width > 0 ? (
          <Svg width={canvas.width} height={canvas.height}>
            <G transform={landTransform(view)}>
              <Path d={land} fill={colors.mapLand} />
            </G>
            {branchPins.map(({ item, point }) => {
              const s = applyView(point, view);
              const color = colorFor(item.id);
              return (
                <Fragment key={`b-${item.id}`}>
                  {item.id === homeBranchId ? (
                    <Circle
                      cx={s.x}
                      cy={s.y}
                      r={HOME_HALO}
                      fill={color}
                      opacity={0.22}
                    />
                  ) : null}
                  <Circle
                    cx={s.x}
                    cy={s.y}
                    r={BRANCH_PIN}
                    fill={color}
                    stroke={colors.mapSea}
                    strokeWidth={1.6}
                  />
                </Fragment>
              );
            })}
          </Svg>
        ) : null}
      </View>

      {/* Zoom + locate (mockup .mctrl), floating above the sheet. */}
      <View
        style={{
          position: 'absolute',
          right: spacing.md + 2,
          bottom: controlsBottom,
          gap: spacing.sm + 2,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.control,
            overflow: 'hidden',
          }}
        >
          <ZoomButton
            label={t('family:mapZoomIn')}
            Icon={PlusIcon}
            onPress={() => {
              setView((v) => zoomView(v, 1.6, canvas));
            }}
          />
          <View style={{ height: 1, backgroundColor: colors.cardline }} />
          <ZoomButton
            label={t('family:mapZoomOut')}
            Icon={MinusIcon}
            onPress={() => {
              setView((v) => zoomView(v, 1 / 1.6, canvas));
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family:mapLocate')}
          onPress={() => {
            setView(fitBranches(branches, canvas));
          }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.control,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <LocateIcon size={20} color={colors.blue} />
        </Pressable>
      </View>

      {/* "The family, lately" (mockup .msheet): a swipeable bottom sheet teasing
          recent testimonies; the full feed is the Testimonies tab. */}
      {hasSheet ? (
        <Animated.View
          onLayout={(e) => {
            setSheetHeight(e.nativeEvent.layout.height);
          }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            transform: [{ translateY: sheetY }],
            backgroundColor: colors.card,
            borderTopLeftRadius: radius.cardHero,
            borderTopRightRadius: radius.cardHero,
            borderTopWidth: 1,
            borderTopColor: colors.cardline,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.lg,
            shadowColor: '#0e1420',
            shadowOffset: { width: 0, height: -8 },
            shadowOpacity: 0.16,
            shadowRadius: 18,
            elevation: 12,
          }}
        >
          {/* Only the header (grab + title) is the drag handle, so taps on the
              rows below still open their testimony. */}
          <View
            accessibilityRole="adjustable"
            accessibilityLabel={t('family:mapSheetHandle')}
            {...sheetResponder.panHandlers}
          >
            <View
              accessible={false}
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.cardline,
                alignSelf: 'center',
                marginBottom: spacing.sm,
              }}
            />
            <Text
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 15,
                color: colors.text,
                marginBottom: spacing.sm,
              }}
            >
              {t('family:mapLately')}
            </Text>
          </View>
          {testimonies.slice(0, SHEET_ROWS).map((item) => (
            <SheetRow
              key={item.id}
              testimony={item}
              branchName={branchNames[item.branch_id] ?? null}
              color={colorFor(item.branch_id)}
              onPress={() => {
                onOpenTestimony(item.id);
              }}
            />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
