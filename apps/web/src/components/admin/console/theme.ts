// AG Studio in boreal's brand (brand.md): Aurora Teal on softly tinted surfaces, Manrope for
// text. Every value points at a console token (console.css, the site's tokens as hex), so the
// console follows light and dark mode with the rest of the admin area.

import { studioTheme } from "ag-studio";

const v = (name: string) => `var(--${name})`;
const line = (name: string) => ({ width: 1, color: v(name) });
const SANS = "var(--font-manrope), ui-sans-serif, system-ui, sans-serif";

const palette = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [
    [`chartPaletteFills${i + 1}Color`, v(`bc-chart-${i + 1}`)],
    [`chartPaletteStrokes${i + 1}Color`, v(`bc-chart-${i + 1}`)],
  ]).flat(),
);

export const borealStudioTheme = studioTheme.withParams({
  fontFamily: SANS,
  fontSize: 13,
  textColor: v("bc-fg"),
  foregroundColor: v("bc-fg"),
  subtleTextColor: v("bc-muted-fg"),
  backgroundColor: v("bc-card"),
  borderColor: v("bc-border"),
  accentColor: v("bc-primary"),
  iconColor: v("bc-muted-fg"),
  rowHoverColor: v("bc-accent"),

  // The canvas is the page: no frame, the admin area's tinted background between cards.
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: v("bc-bg"),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: v("bc-bg"),
  studioCanvasPadding: 4,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: SANS,

  // Widgets are the site's cards.
  studioWidgetBackgroundColor: v("bc-card"),
  studioWidgetBorder: line("bc-border"),
  studioWidgetBorderRadius: 14,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: SANS,
  studioWidgetTitleFontSize: 13,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: v("bc-fg"),
  studioWidgetSubtitleFontFamily: SANS,
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: v("bc-muted-fg"),
  studioWidgetCaptionFontFamily: SANS,
  studioWidgetCaptionFontSize: 12,
  studioWidgetCaptionTextColor: v("bc-muted-fg"),
  studioWidgetResizeBorderColor: v("bc-primary"),

  studioPanelContainerBackgroundColor: v("bc-card"),
  studioPanelContainerBorder: line("bc-border"),
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: v("bc-border"),
  studioPanelDividerActiveColor: v("bc-primary"),
  studioPanelSectionBorderColor: v("bc-border"),
  studioPanelHeaderFontFamily: SANS,
  studioPanelHeaderFontWeight: 600,
  studioPanelChevronButtonHoverBackgroundColor: v("bc-accent"),
  studioPanelChevronButtonHoverColor: v("bc-primary"),
  studioToggleButtonActiveBackgroundColor: v("bc-primary-soft"),
  studioToggleButtonActiveBorderColor: v("bc-primary"),
  studioToggleButtonActiveColor: v("bc-primary-soft-fg"),

  gridFontFamily: SANS,
  gridFontSize: 13,
  gridCellTextColor: v("bc-fg"),
  gridHeaderBackgroundColor: v("bc-muted"),
  gridHeaderTextColor: v("bc-muted-fg"),
  gridHeaderFontWeight: 600,
  gridHeaderFontSize: 12,
  gridRowHeight: 34,
  gridRowBorder: line("bc-gridline"),
  gridHeaderRowBorder: line("bc-border"),
  gridPinnedRowBorder: line("bc-border"),
  gridRowHoverColor: v("bc-accent"),
  gridWrapperBorder: false,

  chartFontFamily: SANS,
  chartTextColor: v("bc-fg"),
  chartSubtleTextColor: v("bc-muted-fg"),
  chartAxisLineColor: v("bc-border"),
  chartGridLineColor: v("bc-gridline"),
  ...palette,
});
