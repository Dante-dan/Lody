import * as stylex from '@stylexjs/stylex';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Field } from '../src/field/field';
import { field, fieldPaletteTheme } from '../src/field/field.tokens.stylex';
import { Input } from '../src/field/input';
import { Textarea } from '../src/field/textarea';
import { forcedThemeClassNames } from '../src/theme/theme';

function classesOf(html: string, tag: string): string[] {
  const open = new RegExp(`<${tag}\\b[^>]*>`).exec(html)?.[0] ?? '';
  return (/class="([^"]*)"/.exec(open)?.[1] ?? '').split(' ').filter(Boolean);
}

function attrOf(html: string, tag: string, attribute: string): string | undefined {
  const open = new RegExp(`<${tag}\\b[^>]*>`).exec(html)?.[0] ?? '';
  return new RegExp(`${attribute}="([^"]*)"`).exec(open)?.[1];
}

const named = (
  <Field.Root name="title">
    <Field.Label>Session title</Field.Label>
    <Input placeholder="Describe the task" />
    <Field.Description>Shown in the sidebar.</Field.Description>
    <Field.Error match="valueMissing">Enter a title.</Field.Error>
  </Field.Root>
);

describe('Field', () => {
  test('the label is associated with the control the field renders', () => {
    const html = renderToStaticMarkup(named);
    const control = attrOf(html, 'input', 'id');
    expect(control).toBeTruthy();
    expect(attrOf(html, 'label', 'for')).toBe(control);
  });

  test('a field that reports no error keeps it out of the markup', () => {
    const html = renderToStaticMarkup(named);
    expect(html).toContain('Shown in the sidebar.');
    expect(html).not.toContain('Enter a title.');
    expect(html).not.toContain('aria-invalid');
    expect(html).not.toContain('data-invalid');
  });

  test('invalid marks the control, shows the error, and adds a ring class', () => {
    const valid = renderToStaticMarkup(named);
    const invalid = renderToStaticMarkup(
      <Field.Root name="title" invalid>
        <Field.Label>Session title</Field.Label>
        <Input placeholder="Describe the task" />
        <Field.Error match>Enter a title.</Field.Error>
      </Field.Root>
    );
    expect(invalid).toContain('aria-invalid="true"');
    expect(invalid).toContain('Enter a title.');
    const added = classesOf(invalid, 'input').filter(
      (name) => !classesOf(valid, 'input').includes(name)
    );
    expect(added.length).toBeGreaterThan(0);
  });

  test('disabled on the root disables the control and dims the label', () => {
    const enabled = renderToStaticMarkup(named);
    const html = renderToStaticMarkup(
      <Field.Root name="title" disabled>
        <Field.Label>Session title</Field.Label>
        <Input />
      </Field.Root>
    );
    expect(html).toContain('disabled=""');
    const added = classesOf(html, 'label').filter(
      (name) => !classesOf(enabled, 'label').includes(name)
    );
    expect(added.length).toBeGreaterThan(0);
  });
});

describe('Input and Textarea', () => {
  test('Input renders a native input carrying its size step', () => {
    const html = renderToStaticMarkup(<Input size="small" placeholder="Search" />);
    expect(html).toMatch(/^<input/);
    expect(html).toContain('data-size="small"');
    expect(html).toContain('placeholder="Search"');
  });

  test('Textarea renders a native textarea and keeps textarea attributes', () => {
    const html = renderToStaticMarkup(<Textarea rows={4} placeholder="Describe the task" />);
    expect(html).toMatch(/^<textarea/);
    expect(html).toContain('rows="4"');
    expect(html).toContain('placeholder="Describe the task"');
  });

  test('Input and Textarea share the well styles rather than each defining one', () => {
    const input = classesOf(renderToStaticMarkup(<Input />), 'input');
    const textarea = classesOf(renderToStaticMarkup(<Textarea />), 'textarea');
    const shared = input.filter((name) => textarea.includes(name));
    expect(shared.length).toBeGreaterThan(5);
  });

  test('a caller className lands after the compiled classes', () => {
    const html = renderToStaticMarkup(<Input className="w-64" />);
    const cls = /class="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(cls.endsWith(' w-64')).toBe(true);
    expect(cls.split(' ').length).toBeGreaterThan(5);
  });
});

describe('field tokens', () => {
  test('compile to custom property references', () => {
    expect(field.background).toMatch(/^var\(--/);
    expect(field.ring).toMatch(/^var\(--/);
    expect(field.invalidRing).toMatch(/^var\(--/);
  });

  test('the palette theme rides along with every forced palette', () => {
    const themeClasses = (stylex.props(fieldPaletteTheme).className ?? '').split(' ').filter(Boolean);
    expect(themeClasses.length).toBeGreaterThan(0);
    for (const name of themeClasses) {
      expect(forcedThemeClassNames('light')).toContain(name);
      expect(forcedThemeClassNames('dark')).toContain(name);
    }
  });
});
