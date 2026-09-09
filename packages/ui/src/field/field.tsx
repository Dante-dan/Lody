import { Field as BaseField } from '@base-ui/react/field';
import * as stylex from '@stylexjs/stylex';
import { forwardRef, type ComponentProps } from 'react';
import { appendClassName } from '../internal/class-name';
import { text } from '../tokens/scales.stylex';
import { field } from './field.tokens.stylex';

type RootBaseProps = ComponentProps<typeof BaseField.Root>;
type LabelBaseProps = ComponentProps<typeof BaseField.Label>;
type DescriptionBaseProps = ComponentProps<typeof BaseField.Description>;
type ErrorBaseProps = ComponentProps<typeof BaseField.Error>;

/** State every Field part receives from `Field.Root`. */
export type FieldState = BaseField.Root.State;

export interface FieldRootProps extends Omit<RootBaseProps, 'className'> {
  className?: string;
}
export interface FieldLabelProps extends Omit<LabelBaseProps, 'className'> {
  className?: string;
}
export interface FieldDescriptionProps extends Omit<DescriptionBaseProps, 'className'> {
  className?: string;
}
export interface FieldErrorProps extends Omit<ErrorBaseProps, 'className'> {
  className?: string;
}

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: field.gap,
    minWidth: 0,
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: field.gap,
    color: field.label,
    fontSize: field.labelSize,
    lineHeight: field.labelLeading,
    fontWeight: 500,
    letterSpacing: text.controlTracking,
    userSelect: 'none',
  },
  note: {
    margin: 0,
    fontSize: field.labelSize,
    lineHeight: field.labelLeading,
    fontWeight: 400,
  },
  hint: { color: field.hint },
  error: { color: field.error },
  // Disabled is one opacity for the family; the control dims through its own
  // `:disabled`, so nothing here stacks a second layer on top of it.
  dimmed: { opacity: field.disabledOpacity },
});

export const FieldRoot = forwardRef<HTMLDivElement, FieldRootProps>(function FieldRoot(
  { className, ...rest },
  ref
) {
  const sx = stylex.props(styles.root);
  return (
    <BaseField.Root
      ref={ref}
      {...rest}
      className={appendClassName(sx.className, className)}
      style={sx.style}
    />
  );
});

export const FieldLabel = forwardRef<HTMLLabelElement, FieldLabelProps>(function FieldLabel(
  { className, ...rest },
  ref
) {
  return (
    <BaseField.Label
      ref={ref}
      {...rest}
      className={(state) =>
        appendClassName(
          stylex.props(styles.label, state.disabled && styles.dimmed).className,
          className
        )
      }
    />
  );
});

export const FieldDescription = forwardRef<HTMLParagraphElement, FieldDescriptionProps>(
  function FieldDescription({ className, ...rest }, ref) {
    return (
      <BaseField.Description
        ref={ref}
        {...rest}
        className={(state) =>
          appendClassName(
            stylex.props(styles.note, styles.hint, state.disabled && styles.dimmed).className,
            className
          )
        }
      />
    );
  }
);

export const FieldError = forwardRef<HTMLDivElement, FieldErrorProps>(function FieldError(
  { className, ...rest },
  ref
) {
  const sx = stylex.props(styles.note, styles.error);
  return (
    <BaseField.Error
      ref={ref}
      {...rest}
      className={appendClassName(sx.className, className)}
      style={sx.style}
    />
  );
});

/**
 * The field composition. `Field.Root` owns name, disabled and validity; the
 * parts read that state instead of taking their own copies of it.
 */
export const Field = {
  Root: FieldRoot,
  Label: FieldLabel,
  Description: FieldDescription,
  Error: FieldError,
  Validity: BaseField.Validity,
};
