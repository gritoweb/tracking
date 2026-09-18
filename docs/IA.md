# AI Strategy and Integration Plan

## Multi-Model Architecture
This project was **designed from the ground up to support two different AI models** working together:
1. **Quick-add & Background Parsing:** A small, fast model to extract structured JSON from raw text (e.g., guessing task colors, reading dates).
2. **Assistant Chat:** A larger, more complex model for conversational logic and tool calling (e.g., "Start my timer").

By keeping the architecture split, the system can use heavy intelligence only when necessary, saving costs on simpler background tasks.

---

## Current Configuration (The "Sweet Spot")

Even though the system is built for 2 different models, the recent release of the **Meta Llama 3.1** family changed the game. Because it is highly fluent in both English and Portuguese (pt-BR) and natively supports Tool Calling, we are temporarily setting **both endpoints to use the exact same model**.

**Model assigned to both roles:** `@cf/meta/llama-3.1-8b-instruct`

### Why use this model for both?
- **It is bilingual:** Handles Portuguese slang, dates, and instructions flawlessly.
- **It is extremely cheap:** Only uses ~16 to 25 neurons per message, giving us roughly **400 to 600 free messages per day** under Cloudflare's 10,000 free neuron quota.
- **Good enough for chat:** Its intelligence is high enough to handle the Assistant tool-calling perfectly, making a massive secondary model (like `Scout`) unnecessary for now.

### Pricing & Quotas (Cloudflare Workers AI)
- **Free Tier:** 10,000 neurons per day.
- **Overages:** `$0.011` per 1,000 neurons (about 50 extra messages for `$0.01`).

---

## Future Flexibility

Because the codebase already supports 2 distinct AI bindings, if we ever feel that the `8b` model is making mistakes in long, complex conversations via the Assistant Chat, we can simply switch the Chat binding to a heavier model (like `@cf/meta/llama-3.1-70b-instruct` or `Scout`) without touching the Quick-Add logic. 

For now, sticking to `llama-3.1-8b-instruct` for everything keeps the code simple and the infrastructure costs practically at zero.
