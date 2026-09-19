# Flight agent MVP scope — frozen 19 September 2026

This is the behavior contract for the first consolidated Terra-medium baseline.
Change the scope only after the baseline completes; any later product change
starts a new baseline version.

## Supported

- One-way search for one traveler.
- Origin/destination as a city group, airport name, or IATA code.
- Exact, range, rolling-seven-day, next-week, and nearby-date searches.
- Business cabin and today-through-seven-days as explicit application defaults.
- Economy, premium economy, business, first, budget, direct-only, and sorting
  when the user asks for them.
- Follow-up changes that preserve every trip field the user did not change.
- Public CommonSwyft staging search, with returned fields checked against the
  backend response.
- General privacy, terms, data-handling, and refund-policy questions grounded
  in the repository policy snapshot, with validated citations.
- A support handoff when the reference material cannot safely answer a relevant
  policy question.
- Explicit saved defaults for home airport, usual cabin, and a soft preference
  for nonstop flights. A proposed change is saved only after user action.
- Professional handling of frustration, prompt injection, unrelated requests,
  and attempted purchase instructions.

## Deliberately unsupported

- Round trip, multi-city, multiple travelers, and “take me anywhere.”
- Booking, checkout, payment, cancellation, or any other consequential action.
- Ticket-specific refundability or booking lookup.
- Baggage guarantees, airline exclusions, or constraints absent from the search
  API contract.
- Automatic preference inference from location or search history.
- Production inventory, production deployment, WhatsApp delivery, or a
  deployed account-backed preference connection.

## Baseline rule

Run Terra medium once across every supported behavior and boundary. Repeat only
failures and high-risk consequential cases. Code tests run separately and do not
count as model evaluations. A passing development baseline is evidence for this
exact scope, not a production accuracy claim.
