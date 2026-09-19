# Learning guide

This guide is the oral walkthrough for the project. The goal is to explain each
decision in plain language, including what the system does, why it is designed
that way and where its limits are.

## The system in one sentence

The flight agent uses a language model to interpret a traveler’s request, while
ordinary application code controls state, calls an allowlisted search API,
validates the response and formats the result.

## The product problem

CommonSwyft already provides flight search through a web product. The experiment
asks whether the same capability can be made easier to access through natural
conversation and eventually through channels such as web chat or WhatsApp. The
agent layer interprets requests and orchestrates the existing API. It does not
replace the flight-search backend or expose the product codebase.

## Components

| Component | What it does | Why it exists |
|---|---|---|
| Channel | Collects messages in web chat and could later be WhatsApp | Keeps the conversation interface separate from agent logic |
| Harness | Manages prompts, state, tools, validation, limits and rendering | Gives the application control over model behavior |
| Model | Converts natural language into one structured action | Handles ambiguity and follow-up language better than fixed forms |
| Search tool | Sends validated parameters to the flight-search API | Live availability belongs in the backend, not model memory |
| Policy retrieval | Supplies approved policy passages to the model | Grounds policy answers in evidence |
| Session state | Retains the current trip and recent messages | Makes follow-up changes work within one conversation |
| Persistent preferences | Stores explicitly confirmed defaults | Carries useful choices between conversations without silently profiling users |
| Renderer | Produces consistent flight cards from validated data | Prevents the model from inventing prices, times or routes |
| Evaluation harness | Runs fixed scenarios and records outcomes | Makes prompt and model changes measurable |

## Agent versus harness

The agent is the complete conversational capability. The harness is the
application machinery around the model. The model is one replaceable part of
the agent. The backend remains the source of truth for flights and account data.

## Tool calling versus RAG

A tool call performs or requests a defined operation. Flight search uses a tool
because availability and prices are live structured data.

Retrieval-augmented generation finds relevant reference material and adds it to
the model’s context. General privacy and terms questions use retrieval because
their answers live in documents. A question about a specific booking would need
an authenticated account tool as well.

## Memory

The model does not automatically remember customers. The harness passes recent
messages and trip state on each turn. Long-term preferences must be stored by
the application against an authenticated user. This version allows only
explicit home-airport, cabin and nonstop defaults. A trip instruction overrides
a saved default without rewriting it.

## Context precedence

1. System and safety rules
2. The traveler’s latest explicit instruction
3. Existing trip fields that were not changed
4. Saved preferences as soft defaults
5. Recent conversation for continuity

This ordering answers questions such as: if the saved cabin is business but the
traveler says “economy instead,” economy wins for the trip while the saved
preference remains business.

## Safety and reliability

The model can choose only one declared action. Code checks its fields before
anything executes. The model cannot choose a URL, see credentials, book a
flight or create a payment. Backend responses are validated before display.
Search creation is not automatically retried because the first request may have
succeeded even if its response timed out.

## Evaluation

Deterministic tests validate code invariants. Model cases test interpretation,
clarification and routing. A bounded live case checks displayed data against the
adapter response. The prompt version and source hashes identify exactly what was
tested. One passing attempt is regression evidence, not a production success
rate.

## Model choice

The model comparison first required acceptable behavior, then compared latency
and estimated token cost. Terra medium produced the best observed speed and cost
tradeoff among the configurations that passed. This is a development decision,
not proof that it is universally the best model.

## Questions to be ready for

1. Why is this an agent rather than a form or classifier?
2. Which decisions does the model make and which remain deterministic?
3. How is a follow-up request merged with existing state?
4. When would you use a tool, RAG or persistent memory?
5. What happens when the model produces invalid arguments?
6. Why are search requests not retried automatically?
7. What does the baseline test, and what does it leave unknown?
8. How would authenticated web or WhatsApp users map to stored preferences?
9. What would need to change before booking or payment entered scope?
10. How would you safely compare a new open-weight model?
