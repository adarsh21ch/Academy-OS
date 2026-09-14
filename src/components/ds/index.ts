/**
 * Cricket Academy OS V2 — Design System barrel.
 *
 * Every new screen should import primitives from here:
 *   import { AppShell, TopBar, BottomNav, Card, StatCard, ... } from "@/components/ds";
 *
 * Rules:
 *  - No hardcoded colors — use CSS tokens from src/styles.css.
 *  - No duplicate components — extend existing primitives.
 *  - Mobile first — every primitive is designed for one-hand thumb use.
 */

export * from "./tokens";
export * from "./AppShell";
export * from "./TopBar";
export * from "./BottomNav";
export * from "./Screen";
export * from "./Card";
export * from "./ListItem";
export * from "./States";
export * from "./BottomSheet";
export * from "./SegmentedControl";
export * from "./SearchBar";
export * from "./LiveBadge";
export * from "./Tabs";
