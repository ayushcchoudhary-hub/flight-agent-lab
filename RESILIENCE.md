# Resilience policy

Retries are based on whether repeating an operation is safe, not on whether an
error looks inconvenient.

| Operation | Automatic retry | Reason |
|---|---:|---|
| Interpret a request with the model | Once for HTTP 429, 502, 503 or 504 | The provider rejected or could not serve the request. The retry consumes the same session call budget. |
| Model timeout or transport failure | No | The provider may have received and billed the uncertain request. |
| Create a flight search | No | A timeout can leave the creation outcome unknown. Retrying could duplicate work without an idempotency key. |
| Read an existing search | Twice for temporary HTTP or transport failures | Reads are safe to repeat. Backoff is bounded and honors `Retry-After` up to two seconds. |
| Poll a pending comparison | Four bounded polls | This checks an existing search ID and never creates another search. |
| Authentication, validation and permission errors | No | Retrying unchanged input cannot fix these errors. |

Every retry is bounded. The search adapter can only read a search identifier it
created itself. The model cannot choose the endpoint, retry count or timeout.

The next production step would be an idempotency key supported by the search
API. That would let the client safely reconcile an uncertain create request.
Booking and payment would need their own durable workflow, idempotency record
and human confirmation before this policy could cover them.
