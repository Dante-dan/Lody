import * as stylex from '@stylexjs/stylex';
import { colors, shadow } from '../tokens/colors.stylex';
import { control, radius, text } from '../tokens/scales.stylex';

/**
 * One token group for the whole field family — label, control, help and error.
 * Input, Textarea and every control that migrates next read these, so a state
 * has one colour in one place instead of one per component.
 */
export const field = stylex.defineVars({
  heightSmall: control.small,
  heightMedium: control.medium,
  heightLarge: control.large,
  paddingXSmall: '8px',
  paddingXMedium: '10px',
  paddingXLarge: '12px',
  paddingYBlock: '8px',
  radiusSmall: radius.small,
  radiusMedium: radius.medium,
  textSmall: text.footnoteSize,
  textMedium: text.subheadlineSize,
  labelSize: text.footnoteSize,
  labelLeading: text.footnoteLeading,
  gap: '6px',
  ringWidth: '2px',
  textareaMinHeight: '72px',
  background: colors.wellBackground,
  well: shadow.inset,
  value: colors.label,
  label: colors.label,
  placeholder: colors.tertiaryLabel,
  hint: colors.tertiaryLabel,
  error: colors.destructive,
  ring: colors.accent,
  invalidRing: colors.destructive,
});

/**
 * Re-declares the colour-valued tokens on the element that carries a forced
 * palette; see the note in `button.tokens.stylex.ts` for why a group declared
 * only at the document root keeps the root palette inside a themed subtree.
 */
export const fieldPaletteTheme = stylex.createTheme(field, {
  background: colors.wellBackground,
  well: shadow.inset,
  value: colors.label,
  label: colors.label,
  placeholder: colors.tertiaryLabel,
  hint: colors.tertiaryLabel,
  error: colors.destructive,
  ring: colors.accent,
  invalidRing: colors.destructive,
});
