import { Input as BaseInput } from '@base-ui/react/input';
import * as stylex from '@stylexjs/stylex';
import { forwardRef, type ComponentProps, type ReactElement, type Ref } from 'react';
import { appendClassName } from '../internal/class-name';
import { text } from '../tokens/scales.stylex';
import { field } from './field.tokens.stylex';
import { well } from './well';

export type TextareaResize = 'vertical' | 'none';

type BaseProps = ComponentProps<typeof BaseInput>;

export interface TextareaProps extends Omit<
  ComponentProps<'textarea'>,
  'className' | 'style' | 'color' | 'ref'
> {
  /** Whether the person can drag the control taller. */
  resize?: TextareaResize;
  render?: ReactElement;
  className?: string;
}

const styles = stylex.create({
  textarea: {
    display: 'block',
    paddingBlock: field.paddingBlock,
    paddingInline: field.paddingXMedium,
    borderRadius: field.radiusMedium,
    fontSize: field.textMedium,
    lineHeight: text.subheadlineLeading,
    minHeight: field.textareaMinHeight,
  },
  resizeVertical: { resize: 'vertical' },
  resizeNone: { resize: 'none' },
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { resize = 'vertical', className, render, ...rest },
  ref
) {
  // Base UI has no textarea part; `Input` is `Field.Control`, which renders
  // whatever `render` gives it and keeps the field wiring. The cast carries the
  // textarea element props Base UI types as input props but forwards untouched.
  const props = rest as unknown as Omit<BaseProps, 'className' | 'render' | 'ref'>;
  return (
    <BaseInput
      ref={ref as Ref<HTMLElement>}
      render={render ?? <textarea />}
      {...props}
      className={(state) =>
        appendClassName(
          stylex.props(
            well.base,
            styles.textarea,
            resize === 'none' ? styles.resizeNone : styles.resizeVertical,
            state.valid === false && well.invalid
          ).className,
          className
        )
      }
    />
  );
});
