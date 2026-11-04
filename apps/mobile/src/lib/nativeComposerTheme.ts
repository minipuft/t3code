import { flattenThemeColor, type MobileThemeVariables } from "./mobileTheme";

/** Native chip parsers need opaque hex instead of CSS rgba or platform-specific alpha order. */
export function createNativeComposerTheme(theme: MobileThemeVariables) {
  const surface = flattenThemeColor(theme["--color-composer-surface"], theme["--color-screen"]);
  return {
    text: flattenThemeColor(theme["--color-foreground"], surface),
    placeholder: flattenThemeColor(theme["--color-placeholder"], surface),
    markdownMarker: flattenThemeColor(theme["--color-foreground-muted"], surface),
    markdownAccent: flattenThemeColor(theme["--color-md-link"], surface),
    markdownCode: flattenThemeColor(theme["--color-md-code-text"], surface),
  };
}
