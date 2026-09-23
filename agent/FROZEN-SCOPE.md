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
- “Take me anywhere” (added 22 September 2026): ranked business and first
  class deals from the product's public deals feed, for a stated city, the
  current trip's origin, a saved home airport, or every departure city.
  Choosing a deal runs a normal live search. Deals are shown only as the feed
  provides them, with the date they were checked.
- A link from every results reply to the same search on CommonSwyft, where
  selection and checkout happen.
- Explicit saved defaults for home airport, usual cabin, and a soft preference
  for nonstop flights. A proposed change is saved only after user action.
- Professional handling of frustration, prompt injection, unrelated requests,
  and attempted purchase instructions. User profanity does not block a valid
  search. Generated copy cannot mirror abuse, insult, threaten, sexualize,
  expose secrets or claim a consequential action was completed.

## Deliberately unsupported

- Round trip, multi-city and multiple travelers.
- Booking, payment, cancellation, or any other consequential action in the chat.
  Checkout happens on CommonSwyft through the results link.
- Ticket-specific refundability or booking lookup.
- Baggage guarantees, airline exclusions, or constraints absent from the search
  API contract.
- Automatic preference inference from location or search history.
- Production inventory, production deployment, WhatsApp delivery, or a
  deployed account-backed preference connection.

## Scope changes after the freeze

Each is recorded here with its date and the held-out cases that pin it.

- 22 September 2026: “take me anywhere” moved into scope. Held-out cases
  G1–G11. Prompt contract `flight-search-v1.6.0`.

## Baseline rule

Run Terra medium once across every supported behavior and boundary. Repeat only
failures and high-risk consequential cases. Code tests run separately and do not
count as model evaluations. A passing development baseline is evidence for this
exact scope, not a production accuracy claim.

## Hardening amendment · 20 September 2026

Prompt `flight-search-v1.4.1` keeps the same product scope. It adds deterministic
handling for baggage guarantees, purchase attempts and existing-booking actions,
preserves explicit named dates, and improves policy and support routing. These
are corrections to the frozen contract rather than new product capabilities.
