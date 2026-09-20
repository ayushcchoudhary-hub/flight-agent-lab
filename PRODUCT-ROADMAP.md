# Channel and transaction decisions

This record separates product choices from implementation ideas. It keeps the
next phase focused on a useful traveler outcome rather than adding architecture
because it is available.

## Web first, WhatsApp second

The deployed web chat is the reference client because it is easy to inspect,
reset and evaluate. WhatsApp should be another channel into the same harness,
not a separate agent with different travel logic.

Proposed WhatsApp opening:

> **Business class, economy prices.**
>
> Tell me where you are flying from and where you want to go.

The first line establishes positioning. The second begins the task. It should be
tested as channel copy and must not change the default cabin or promise that
every business fare is priced like economy.

Before a WhatsApp pilot, add a dedicated experimental number, verified inbound
webhooks, channel rate limits, disclosure, deletion handling and an account-link
flow for protected data. Public search could remain anonymous. Preferences,
bookings and other personal data require a verified CommonSwyft account mapping.

## Booking expansion

Direct payment is not the next step. The smallest useful expansion is:

1. Let the traveler select a returned option.
2. Revalidate price and availability.
3. Create an account-bound quote or cart item through an approved product API.
4. Send the traveler to authenticated CommonSwyft web checkout.
5. Require the traveler to review and confirm before payment.

The model and harness should never receive card details. Existing checkout and
payment infrastructure should remain the system of record. This slice requires
a stable offer identifier, quote expiry, identity, authorization and idempotency
contract. Until those interfaces are approved, booking stays outside scope.

An agent wallet is useful only if the product goal becomes autonomous purchasing
across merchants. It adds approval, funding, regional-availability and dispute
questions that a first-party checkout handoff avoids.

## Product analytics

PostHog is useful only when it can answer a product decision. Review aggregated,
privacy-approved funnel events such as search started, offer selected, checkout
started, payment completed and failure category. Use them to identify where
travelers stop and which conversation capability might remove that friction.

Do not copy raw personal data, search terms, routes, booking references or card
information into this repository or the evaluation suite. Low traffic is
qualitative evidence. It should shape hypotheses, not produce false statistical
confidence.

## Decision order

1. Keep Terra medium as the default and harden the search-only contract.
2. Validate the full web flow with real users under the current invite gate.
3. Add offer selection and an authenticated checkout handoff when the API
   contract and permission boundary exist.
4. Add a temporary WhatsApp number as a channel experiment.
5. Consider autonomous purchase or an agent wallet only after checkout handoff
   proves insufficient.
