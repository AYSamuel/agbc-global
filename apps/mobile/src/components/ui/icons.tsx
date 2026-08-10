import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

// Stroke-based, currentColor-style icons at 1.8 stroke per docs/spec/05.
//
// The glyphs come from LUCIDE (ISC), not from an icon font and not hand-drawn.
// The set this file used to carry was traced from the mockup, and the mockup's
// vocabulary was already Feather's: `check`, the three chevrons, `plus`, `minus`
// and `x` were byte-identical to it. Lucide is Feather's maintained successor, so
// adopting it converges on what the mockup already was rather than restyling the
// app, and it ends the drift that hand-drawing every new glyph guarantees.
//
// Two rules hold this together:
//
// 1. DEEP IMPORTS ONLY (`lucide-react-native/icons/<kebab-name>`). Metro does not
//    tree-shake the package barrel, so `import { Check } from 'lucide-react-native'`
//    pulls all ~1,700 icons into the bundle. The package's `exports` map publishes
//    `./icons/*` precisely for this.
// 2. Every glyph goes through `houseStyle()`, so 1.8 stroke and the 20px default
//    live in ONE place. Call sites keep their existing `<XIcon size color />` shape.
//
// `absoluteStrokeWidth` is deliberately NOT set: Lucide would then hold the stroke
// at a constant screen width for every size, which is a heavier look than the
// mockup's (its SVGs scale stroke with the glyph). Keeping it off is what makes the
// six identical glyphs render pixel-for-pixel as they did before.

import Ban from 'lucide-react-native/icons/ban';
import Bell from 'lucide-react-native/icons/bell';
import Book from 'lucide-react-native/icons/book';
import BookOpen from 'lucide-react-native/icons/book-open';
import Bookmark from 'lucide-react-native/icons/bookmark';
import Calendar from 'lucide-react-native/icons/calendar';
import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Church from 'lucide-react-native/icons/church';
import CircleArrowUp from 'lucide-react-native/icons/circle-arrow-up';
import CirclePlay from 'lucide-react-native/icons/circle-play';
import Clock from 'lucide-react-native/icons/clock';
import Copy from 'lucide-react-native/icons/copy';
import CreditCard from 'lucide-react-native/icons/credit-card';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import FileText from 'lucide-react-native/icons/file-text';
import Flame from 'lucide-react-native/icons/flame';
import Globe from 'lucide-react-native/icons/globe';
import GraduationCap from 'lucide-react-native/icons/graduation-cap';
import Heart from 'lucide-react-native/icons/heart';
import House from 'lucide-react-native/icons/house';
import Image from 'lucide-react-native/icons/image';
import Info from 'lucide-react-native/icons/info';
import Landmark from 'lucide-react-native/icons/landmark';
import Library from 'lucide-react-native/icons/library';
import Link from 'lucide-react-native/icons/link';
import Locate from 'lucide-react-native/icons/locate';
import Lock from 'lucide-react-native/icons/lock';
import Mail from 'lucide-react-native/icons/mail';
import MapPin from 'lucide-react-native/icons/map-pin';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import Search from 'lucide-react-native/icons/search';
import Settings from 'lucide-react-native/icons/settings';
import Share from 'lucide-react-native/icons/share';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import SquarePen from 'lucide-react-native/icons/square-pen';
import SquarePlay from 'lucide-react-native/icons/square-play';
import Star from 'lucide-react-native/icons/star';
import Trash2 from 'lucide-react-native/icons/trash-2';
import User from 'lucide-react-native/icons/user';
import Users from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';

export interface IconProps extends SvgProps {
  size?: number;
  color: string;
}

/** 05's icon stroke. Lucide's own default is 2. */
const STROKE = 1.8;
const SIZE = 20;

// `strokeWidth` is intentionally left to SvgProps' own NumberProp: narrowing it to
// `number` here conflicts with that declaration rather than tightening it.
type LucideGlyph = ComponentType<SvgProps & { size?: number; color?: string }>;

function houseStyle(Glyph: LucideGlyph, displayName: string, stroke = STROKE) {
  function Wrapped({ size = SIZE, color, ...rest }: IconProps) {
    return <Glyph size={size} color={color} strokeWidth={stroke} {...rest} />;
  }
  Wrapped.displayName = displayName;
  return Wrapped;
}

export const CheckIcon = houseStyle(Check, 'CheckIcon');
export const MailIcon = houseStyle(Mail, 'MailIcon');
export const PlusIcon = houseStyle(Plus, 'PlusIcon');
export const MinusIcon = houseStyle(Minus, 'MinusIcon');
export const LocateIcon = houseStyle(Locate, 'LocateIcon');
export const LinkIcon = houseStyle(Link, 'LinkIcon');
export const ChevronLeftIcon = houseStyle(ChevronLeft, 'ChevronLeftIcon');
export const CloseIcon = houseStyle(X, 'CloseIcon');
export const LockIcon = houseStyle(Lock, 'LockIcon');
export const BellIcon = houseStyle(Bell, 'BellIcon');
export const StarIcon = houseStyle(Star, 'StarIcon');
export const ChevronRightIcon = houseStyle(ChevronRight, 'ChevronRightIcon');
export const PersonIcon = houseStyle(User, 'PersonIcon');
/** The mockup draws the select/disclosure caret heavier than a navigation chevron. */
export const ChevronDownIcon = houseStyle(ChevronDown, 'ChevronDownIcon', 2.4);
export const PinIcon = houseStyle(MapPin, 'PinIcon');
export const StudyIcon = houseStyle(GraduationCap, 'StudyIcon');
export const BookIcon = houseStyle(Book, 'BookIcon');
export const ShareIcon = houseStyle(Share, 'ShareIcon');
export const SearchIcon = houseStyle(Search, 'SearchIcon');
export const CardIcon = houseStyle(CreditCard, 'CardIcon');
export const BankIcon = houseStyle(Landmark, 'BankIcon');
export const CopyIcon = houseStyle(Copy, 'CopyIcon');
export const UpdateIcon = houseStyle(CircleArrowUp, 'UpdateIcon');
export const ImageIcon = houseStyle(Image, 'ImageIcon');

/** Share to WhatsApp (mockup .wabtn). Lucide carries no brand marks by policy, so
 * this is the generic bubble the mockup already drew, not WhatsApp's own glyph. */
export const WhatsAppIcon = houseStyle(MessageCircle, 'WhatsAppIcon');

/** BLOCKED-MEMBERS · nobody blocked (the frame's `.ei` glyph). Lucide's `ban` IS
 * the frame's glyph: a circle with a full diagonal through it, not a person with a
 * cross, which reads as a person being removed rather than the absence of anyone.
 * (`circle-slash` is the wrong one: its diagonal stops short of the rim.) */
export const BlockedIcon = houseStyle(Ban, 'BlockedIcon');

/** POST-PENDING's "sent for review" glyph (mockup frame line 1182): a clock, not a
 * tick. The distinction is the whole point of the screen: the post is waiting, not
 * published. */
export const ClockIcon = houseStyle(Clock, 'ClockIcon');

/** Mockup .prayundo: a counter-clockwise arrow for taking back the last step.
 * `rotate-ccw`, not `undo-2`, which is a straight arrow bending left. */
export const UndoIcon = houseStyle(RotateCcw, 'UndoIcon');

// RHYTHM (W2.8): the two ways a gathering is attended. The church fronts an
// in-person row and RHYTHM's empty state; the screen fronts a live-watch row, which
// `10` counts exactly the same so a diaspora member keeps their rhythm.
export const ChurchIcon = houseStyle(Church, 'ChurchIcon');
export const LiveIcon = houseStyle(SquarePlay, 'LiveIcon');

// The five tab glyphs.
export const HomeTabIcon = houseStyle(House, 'HomeTabIcon');
export const WatchTabIcon = houseStyle(CirclePlay, 'WatchTabIcon');
export const FamilyTabIcon = houseStyle(Users, 'FamilyTabIcon');

// The mockup draws the same heart for the Give tab and for prayer commitment. Kept
// as two named exports over one shared glyph because they mean different things:
// renaming or restyling the Give tab must not silently change what "I will pray"
// looks like.
export const GiveTabIcon = houseStyle(Heart, 'GiveTabIcon');
/** Prayer commitment glyph (mockup .praybtn / .praystats .pi.praying). */
export const HeartIcon = houseStyle(Heart, 'HeartIcon');

// The two ellipsis glyphs keep the mockup's heavier tab weight vs the lighter
// header weight. `...` on the DETAIL header, never on the feed card (docs/spec/09).
export const MoreTabIcon = houseStyle(Ellipsis, 'MoreTabIcon', 2.1);
export const MoreIcon = houseStyle(Ellipsis, 'MoreIcon');

// The MENU-ROW TILE glyphs (mockup `.mic`, the 34px rounded tile on MORE and
// SETTINGS). These were emoji until 2026-08-11, which made them the one surface the
// design system did not govern: emoji are supplied by the OS, so the same row drew
// differently on Samsung, Pixel and iOS, ignored both themes (the graduation cap sank
// into the dark tile while the pin and calendar fired saturated red into a navy and
// gold palette), and changed artwork on an OS update.
export const BookOpenIcon = houseStyle(BookOpen, 'BookOpenIcon');
export const CalendarIcon = houseStyle(Calendar, 'CalendarIcon');
export const InfoIcon = houseStyle(Info, 'InfoIcon');
export const StoreIcon = houseStyle(ShoppingBag, 'StoreIcon');
export const LibraryIcon = houseStyle(Library, 'LibraryIcon');
export const SettingsIcon = houseStyle(Settings, 'SettingsIcon');
export const GlobeIcon = houseStyle(Globe, 'GlobeIcon');
export const LegalIcon = houseStyle(FileText, 'LegalIcon');
export const EditIcon = houseStyle(SquarePen, 'EditIcon');
export const TrashIcon = houseStyle(Trash2, 'TrashIcon');
export const BookmarkIcon = houseStyle(Bookmark, 'BookmarkIcon');
export const FlameIcon = houseStyle(Flame, 'FlameIcon');

/** SETTINGS' home-branch row. Deliberately separate from `HomeTabIcon` even though
 * both draw Lucide's `house`: restyling the Home TAB must not silently change what a
 * member's home BRANCH looks like (same reasoning as GiveTabIcon vs HeartIcon). */
export const HomeIcon = houseStyle(House, 'HomeIcon');

// A screen that genuinely needs a one-off glyph imports `react-native-svg` directly
// (it is already a direct dependency) and draws it next to its own component, rather
// than this file growing a second, hand-drawn icon system alongside Lucide.
