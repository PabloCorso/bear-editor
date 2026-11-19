# Interface Copy

Bear Editor should explain what is special, not narrate interactions users can
already see or reasonably predict.

## Core rule

Use interface copy when it reveals a capability, constraint, state, or outcome
that the interface cannot communicate on its own. Do not add instructions only
to describe standard direct manipulation or common platform behavior.

The UI should usually teach through its controls, cursor, preview, selection
frame, disabled state, and immediate feedback. Copy is not a substitute for
making an interaction legible.

## Usually omit

- instructions to click a visible button
- instructions to drag a visible handle
- instructions to release the pointer to apply a drag
- `Esc` to cancel or leave a temporary interaction
- generic descriptions that repeat a tool or action name
- success text when the changed state is already visible

For example, a Skew mode with side handles and a live preview needs the title
`Skew`; it does not need “Drag a side handle to skew” or “Cancel · Esc.”

## Worth explaining

- hidden modifiers and alternate input, such as constrained movement
- behavior that differs from common platform conventions
- modes or settings whose effect is not visible until later
- destructive or difficult-to-reverse consequences
- important constraints, validation errors, or recovery steps
- shortcuts in a dedicated shortcut reference when they provide a
  non-obvious capability or alternate path

Examples include selecting behind pictures, preserving resize proportions,
snapping rotation, changing generation modes, and explaining why an action is
unavailable.

## Writing style

- Keep copy clear and succinct. Do not over-explain.
- Lead with the capability or result, not “You can.”
- Use the shortest specific label that distinguishes the behavior.
- Prefer established product terms from the domain docs.
- Keep labels parallel within the same menu or control group.
- Avoid tutorials in persistent chrome. Put genuinely multi-step or conceptual
  guidance in documentation instead.

Before adding copy, ask: if this sentence disappeared, would a user miss a
non-obvious capability or be unable to recover safely? If not, omit it.
