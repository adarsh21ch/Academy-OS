/**
 * Cricket Academy OS Design System — the single dashboard UI library.
 *
 * Every dashboard route must compose its UI exclusively from the components
 * exported here. Do NOT hand-roll page-level headers, tabs, search bars,
 * cards, filters, badges, buttons, empty states or list rows in individual
 * routes; use these instead so every module inherits the same typography,
 * spacing, radius, shadow, colour and interaction language.
 *
 * The look is extracted verbatim from the Students module (the golden
 * standard) so the visual identity remains stable across the app.
 */

export { DashboardPage, DashboardSection } from "./DashboardPage";
export {
  DashboardHeader,
  DashboardToolbar,
  DashboardActionBar,
} from "./DashboardHeader";
export { DashboardSearch } from "./DashboardSearch";
export {
  DashboardKPIRow,
  DashboardKPICard,
  DashboardStat,
} from "./DashboardKPI";
export { DashboardCard, DashboardInfoRow } from "./DashboardCard";
export {
  DashboardEmptyState,
  DashboardLoadingState,
  DashboardErrorState,
} from "./DashboardStates";
export {
  DashboardBadge,
  DashboardStatusBadge,
  type BadgeTone,
} from "./DashboardBadge";
export { DashboardList, DashboardListRow } from "./DashboardList";
export {
  DashboardFilters,
  DashboardFilterSelect,
} from "./DashboardFilters";
export {
  DashboardButton,
  DashboardFloatingAction,
  type DashboardButtonVariant,
  type DashboardButtonSize,
  type DashboardButtonProps,
} from "./DashboardButton";

// Re-export the already-standardised primitives that also live in the
// design system, so consumers can import everything from one path.
export { FilterTabs, type FilterTabItem } from "@/components/shared/FilterTabs";
