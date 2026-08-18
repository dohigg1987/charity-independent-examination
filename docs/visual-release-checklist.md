# Visual release checklist

Complete this review for every user-interface release before production approval.

- Confirm the zero-data, populated, validation-error and success states.
- Exercise login, global search, primary navigation, client creation and client-portal preview.
- Review at 1440×900, 1024×768, 768×1024 and 390×844.
- Check dialog title/action alignment, content gutters, scrolling and footer placement.
- Check keyboard focus, Escape dismissal, tab order and visible focus indicators.
- Check that all text is at least 9px and normal working text is at least 12px.
- Compare the practitioner workspace and client portal against the Clarity Fluent reference.
- Confirm the exact production commit and healthy database/object-storage checks before reporting live.

Automated invariants live in `tests/visual-quality.test.ts`; visual inspection remains a required production approval step.
