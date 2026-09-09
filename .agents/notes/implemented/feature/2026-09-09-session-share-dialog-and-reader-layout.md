# Rebuild the session sharing dialog and reader layout

Status: implemented
Translation: pending

## Abstract

The sharing dialog stacked its disclosure, an almost identical acknowledgement, a
per-row unavailability sentence and several hints as one scrolling column, so the
meaning a user needs before sharing was repeated while the buttons that act on it
could be pushed off a phone screen. The dialog is now a fixed header over one
scrolling body with a pinned action row that carries the consent checkbox, each
meaning is stated once next to the thing it describes, and the anonymous reader
drops its permanent "Read only · Updates live" line in favour of an appearance
control beside the visitor label. The reader's appearance reuses the app's own
`ThemeProvider`, default and storage key rather than a reader-specific mode; the
limit worth knowing is that `localStorage` is per-origin, so the hosted share
domain cannot inherit a choice made on the app domain and remembers its own.

## Decision

### Dialog

`SessionShareDialogFrame` no longer scrolls as a single box. It renders a fixed
header and one scrolling body, and `useKeyboardAwareScrollIntoView` now observes
that body — the element that actually scrolls — which is what the hook documents
as its contract. `SessionShareManager` puts its action row in a `sticky bottom-0`
container inside that body, together with the acknowledgement checkbox that gates
those actions. Previously the checkbox sat at the end of a long candidate list, so
on a phone a user had to scroll past every candidate to discover why the primary
button was disabled.

Copy was cut where it repeated itself, and kept where it carries a decision:

- The disclosure moved onto the link card it describes and states the four things
  a user cannot infer — original documents, history and attachments, later updates,
  and that links are forwardable and not end-to-end encrypted.
- The acknowledgement is now a single short confirmation rather than a second
  paragraph restating the disclosure. Its gating behaviour is unchanged.
- "New conversations are never added automatically" survives as the one-line rule
  on the selection; the instruction to tick items individually was dropped because
  the checkboxes already say that.
- The per-row sentence about cloud sync became a compact "Not ready" badge plus one
  shared explanation rendered only while some candidate is actually ineligible,
  instead of the same sentence under every unavailable row.
- The selected/maximum counter moved into the section heading.

The candidate filter is passed into the manager as a `filter` node so it renders
inside the section it narrows rather than above the link card. Only the target
list is wrapped in the disabled `fieldset`, so narrowing a long list stays possible
while a save is in flight. The heading is a real `h3`; the previous `legend` was
nested inside a `div` and therefore not a valid fieldset caption.

### Reader

The header is one container: workspace name, visitor label and appearance control
on the first line, then the conversation title on a full-width line, then the
target navigation. Putting the visitor label on the workspace line is what makes a
390px-wide phone show a usable title instead of an ellipsis. The permanent
"Read only · Updates live" status is gone — the surface offers no composer, editing,
retry or approval affordance, so it is read-only by construction — and the status
region now renders only interruptions (paused, loading), collapsing when empty.

`ShareThemeToggle` reuses `nextCycledTheme` and `useTheme` from the app's
`theme-provider`, giving the reader the same light → dark → system cycle, the same
`system` default and the same VS Code theme application as the product. The private
host stopped overriding `storageKey`, so it uses the app's key: serving `/s` from the
app's origin now carries a visitor's existing choice over.

## Alternatives considered

Hiding the `h1` when several targets are shared would have removed the echo between
the title and the selected navigation entry, but it makes the existing heading
assertion in the built-page suite pass against a 1px element rather than something a
reader can see. The tabs were capped instead so a second target always peeks in and
the row reads as navigation.

A reader-only light/dark switch was rejected: it would have introduced a second
default and a second cached key competing with the app's, which is the problem the
previous `lody-share-theme` override already created.

## Evidence and limits

`session-share-manager.test.tsx` keeps its four existing behaviour tests and adds
two: the unavailability explanation appears once and only while a candidate is
ineligible, and a mutation in flight freezes the targets while leaving the filter
usable. The built-page suite in the private Web host adds two tests against the real
`dist-share` artifact — the reader resolves an unset preference through `system` and
stores a chosen mode under the app's `vite-ui-theme` key, and a value cached on that
origin overrides the system preference. All twelve built-page tests pass.

Layout was reviewed from rendered screenshots rather than by reading CSS: the manager
stories at 1200px and 390px in both themes and in Chinese, and the built reader at
1280px and 390px in both themes. That review is what caught the status text being
truncated to "Link …" by its own buttons on a narrow phone, and the reader title
being crushed by the visitor label.

Limits: this entry is a client-rendered SPA, so a cached theme is applied when the
reader mounts, not before first paint. Cross-origin theme sharing is not possible and
was not attempted — `localStorage` is per-origin, so `share.lody.ai` keeps a separate
selection from the app domain, which is why the in-page control exists. The screenshots
used synthetic fixtures; no deployed backend was exercised.
