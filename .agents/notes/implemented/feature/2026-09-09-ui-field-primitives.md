# UI field primitives

Status: implemented
Translation: pending

## Abstract

`@lody/ui` had proven one component and a token set, but every remaining control
in `packages/components/src/ui` still reads Tailwind field concepts —
`input-border`, `input-field`, `input-placeholder`, `ring`, `muted` — that the
new token rules define no equivalent for. Migrating Input, Textarea and Label
one at a time across that gap would have let each control invent its own focus,
invalid and disabled colours, forking the token system the migration exists to
unify. This note records adding one `field` component token group and a Base UI
Field composition — `Field.Root` with `Field.Label`, `Input`, `Textarea`,
`Field.Description` and `Field.Error` — so those states are defined once and read
from the field rather than passed to each control, and writing the state mapping
into the token rules and the gallery. Building it exposed that the product
shell's `*:focus, *:focus-visible { outline: none !important }` suppresses every
outline-based focus ring, including the migrated Button's, so the field ring is a
box-shadow instead; Button still carries the suppressed outline and is not fixed
here. No caller is migrated, so the Radix and Tailwind files remain.

## Problem

The package exported `Button` and the theme; `packages/components/src/ui`
still owned every other atom. Proving "the Button pattern works" is not the same
as proving the contract for a control that has states.

The three files this pilot replaces read a vocabulary the new tokens do not have:

- `input.tsx`: `border-input-border`, `bg-input-field`, `text-input-foreground`,
  `placeholder:text-input-placeholder`, `focus-visible:ring-1 ring-ring`,
  `disabled:bg-muted disabled:opacity-60`
- `textarea.tsx`: the same set, plus `ring-offset-background` and an explicitly
  removed focus ring
- `label.tsx`: `@radix-ui/react-label` with `peer-disabled:opacity-70`

Three different disabled treatments (`bg-muted` + 60%, 70%, and the rules'
45%) and two different focus rings already existed in three files. Without a
decided mapping, each migrated control would add a fourth.

## Decision

**One token group for the family, not one per component.** `field` covers the
label, the control, the help text and the error, and the selects, checkboxes and
switches that follow. `button` stays separate because a button is not a field.
The alternative — `input`, `textarea` and `label` groups — is exactly the fork
this change exists to prevent: the same focus colour would be declared three
times and drift on the first redesign.

**Composition, not props.** `Field.Root` owns `name`, `disabled` and validity.
`Input` and `Textarea` read that state through Base UI's `className` callback and
pick their own classes from it. A control therefore has no `invalid` prop for a
caller to keep in sync with the field, and a label is associated with its control
without a hand-written `htmlFor`.

**Base UI throughout.** `Input` is Base UI's `Input`, which is `Field.Control`.
Base UI has no textarea part, so `Textarea` is the same `Field.Control` rendered
as a `<textarea>`; its props are typed from `<textarea>` and cast at the boundary,
because Base UI types the part as an `<input>` while forwarding element props
untouched. `Field.Label` replaces `@radix-ui/react-label`, which keeps the
package's dependency rule intact.

**State is read, not selected.** StyleX conditions are pseudo-classes,
pseudo-elements and at-rules; an attribute selector such as `[data-invalid]` is
not expressible. Base UI passes each part its own state to `className`, which is
both available and more direct than the data attributes it also emits. Focus
stays a CSS `:focus-visible` because a text control matches it for pointer focus
too, so it needs no React state.

Because StyleX keys a conditional value per condition, the invalid style restates
the focused case; otherwise an invalid control would flip back to the accent ring
the moment it takes focus.

### The mapping this closes

| Old Tailwind concept           | New token                                |
| ------------------------------ | ---------------------------------------- |
| `bg-input-field`               | `field.background` (`wellBackground`)    |
| `border-input-border`          | `field.well` (`shadow.inset`); no border |
| `text-input-foreground`        | `field.value` (`label`)                  |
| `text-input-placeholder`       | `field.placeholder` (`tertiaryLabel`)    |
| `ring-ring`                    | `field.ring` (`accent`), 2px             |
| `aria-invalid` colours         | `field.invalidRing` (`destructive`), 2px |
| `disabled:bg-muted opacity-60` | `field.disabledOpacity`, no colour swap  |
| input `text-base md:text-sm`   | `field.textMedium` (13) at weight 500    |
| label `text-sm`                | `field.labelSize` (12) at weight 500     |

The control's own text follows the rules' control step — 13 at weight 500 with
`text.controlTracking`, 12 at the 28px size — rather than the prose weight a
text field might suggest. Dimensions that land on the space scale reference it
(`space.2`, `space.3`, `space.1.5`); the 10px inline padding of the 32px control
is the one literal, because the scale has no half step between 8 and 12.

## Discovered defect: the shell suppresses every outline ring

`packages/components/src/tailwind/index.css` ends its base layer with
`*:focus, *:focus-visible { outline: none !important; }`. Layer order is
`theme, base, stylex, components, utilities`, and for `!important` declarations
layer priority is reversed, so no ordering lets a StyleX rule win. Measured in
Chromium: a focused `Button` with `:focus-visible` matching reports
`outline-style: none` and no ring, and the field's first outline-based ring
behaved the same.

The field ring is therefore a `box-shadow` composed with the well's own inset
shadow, which the same base layer cannot override because its companion
`box-shadow` rule is not `!important` and StyleX sits in a later layer. This is
also the more robust mechanism, so it is now the rule for the package rather
than a local workaround.

Button is left alone. Its ring would have to be restated per variant, since each
variant already owns a different `box-shadow`, and changing a shipped primitive's
appearance is outside this pilot. Two fixes are open: give Button the same
box-shadow ring, or scope the global reset so it stops covering `@lody/ui`
primitives. Until one lands, Button has no visible keyboard focus ring inside the
desktop shell.

## Other alternatives considered

- An `invalid` prop on `Input`. Rejected: two sources of truth for one state,
  and every caller would have to mirror `Field.Root` by hand.
- Keeping `@radix-ui/react-label` and styling it. Rejected: the package depends
  on Base UI only, and a Radix label carries no field state.
- Exporting a flat `Label` alongside `Field.Label`. Rejected: two names for one
  component. `Field.Label` works outside a `Field.Root` with `htmlFor`, so the
  standalone case is covered.

The gallery's own `Field` layout helper was renamed to `Sample` so the primitive
can own the name. `ThemeRoot` now applies a list of component palette themes
rather than a single one, which is the general mechanism the token gallery note
left open until a second colour-valued group existed.

## Verification

`pnpm --filter @lody/ui test` (24 tests) and `pnpm --filter @lody/ui typecheck`
pass. The tests cover label-to-control association, the error staying out of the
markup until the field reports it, invalid adding a class the valid control does
not have, `Field.Root disabled` reaching the control and the label, Input and
Textarea sharing the well styles rather than each defining one, a caller class
landing last, and the field palette theme riding along with both forced palettes.

The board was read in Chromium through Storybook at 1400px. Values read back off
the rendered nodes: heights 28 / 32 / 36 px, radius 8 at 28 and 10 at 32 and 36,
control text 13, well `rgb(232, 234, 237)` in Lody Light and `rgb(28, 28, 28)` in
Vesper with the matching inset shadow, disabled opacity `0.45`, and the invalid
ring `rgb(206, 34, 45)` and `rgb(255, 128, 128)`. Focusing a control by pointer
and by keyboard produced `… inset, rgb(93, 141, 239) 0px 0px 0px 2px` in Lody
Light and `rgb(255, 199, 153)` in Vesper, and an invalid control kept
`rgb(206, 34, 45)` while focused. The console reported no errors.

Limits: no test asserts a rendered appearance, and the focus ring on the board is
drawn on a non-interactive stand-in because a board cannot hold focus while it is
read. Only Chromium was checked. `pnpm check` was not run to completion for the
whole repository in this session.

## Follow-ups

No caller moved: 93 `<Input>`, 30 `<Textarea>` and 67 `<Label>` uses across 71
files still import the Radix and Tailwind versions, and those files are deleted
only when their in-repo callers reach zero. Migrating them is the next step and
is where the mapping above is spent. Checkbox, Select and Switch join the same
`field` group rather than opening their own.
