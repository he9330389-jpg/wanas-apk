import type { ViewStyle, TextStyle, ImageStyle } from "react-native";
import { brandPalette, type Scheme } from "@/constants/brand";

export type WanasStyle = ViewStyle | TextStyle | ImageStyle;

type ThemeGlobal = typeof globalThis & { __WANAS_ACTIVE_SCHEME__?: Scheme };

let activeScheme: Scheme = (globalThis as ThemeGlobal).__WANAS_ACTIVE_SCHEME__ ?? "dark";

function readActiveScheme(): Scheme {
  return (globalThis as ThemeGlobal).__WANAS_ACTIVE_SCHEME__ ?? activeScheme;
}

export function setActiveWanasScheme(scheme: Scheme) {
  activeScheme = scheme;
  (globalThis as ThemeGlobal).__WANAS_ACTIVE_SCHEME__ = scheme;
}

export function getActiveWanasScheme(): Scheme {
  return readActiveScheme();
}

export function getActiveBrandPalette() {
  return brandPalette[readActiveScheme()];
}

/**
 * Returns a stable, read-only proxy whose style entries are created lazily and cached per theme.
 * This preserves existing module-level StyleSheet declarations while making screen styles
 * respond to theme changes on both native and web.
 */
export function themedStyles<T extends Record<PropertyKey, unknown>>(factory: () => T): T {
  const cache = new Map<Scheme, T>();
  const current = () => {
    const scheme = readActiveScheme();
    let styles = cache.get(scheme);
    if (!styles) {
      styles = factory();
      cache.set(scheme, styles);
    }
    return styles;
  };

  return new Proxy({} as T, {
    get(_target, property, receiver) {
      return Reflect.get(current(), property, receiver);
    },
    has(_target, property) {
      return Reflect.has(current(), property);
    },
    ownKeys() {
      return Reflect.ownKeys(current());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(current(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
