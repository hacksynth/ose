# AI Providers

OSE supports environment-level AI configuration and per-user AI settings from the profile page.

## Provider Priority

If `AI_PROVIDER` is empty, OSE attempts to detect a configured provider based on available API keys. A typical priority is Claude, OpenAI, Gemini, then custom compatible endpoints.

## Claude

```env
AI_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

Use Claude for high-quality case analysis grading, explanations, and study planning. `ANTHROPIC_BASE_URL` can point to a trusted proxy.

## OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Use OpenAI for fast explanations, question generation, and chat. Set `OPENAI_BASE_URL` only when using a compatible gateway.

## Gemini

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

Gemini is useful for cost-efficient generation and long-context tasks.

## Custom Endpoint

```env
AI_PROVIDER=custom
CUSTOM_API_KEY=local-key
CUSTOM_BASE_URL=http://localhost:11434/v1
CUSTOM_MODEL=llama3
```

Custom mode works with OpenAI-compatible APIs such as Ollama, DeepSeek, Qwen, vLLM, LM Studio, LocalAI, and some Azure OpenAI gateways.

## Per-user Settings

Users can configure provider, key, base URL, and model from the profile page. This is useful for shared deployments where each learner brings their own API key.

## Image Providers

Wrong-note explanation images use a separate image provider configuration. The text AI provider first turns the wrong-note data into one final image prompt; the image provider then generates the complete Chinese review card in a single image call. OSE stores and serves the finished image.

Supported image providers:

- `openai`: OpenAI Images API, default model `gpt-image-2`.
- `custom`: OpenAI-compatible image generation endpoint.

Environment example:

```env
AI_IMAGE_PROVIDER=openai
OPENAI_IMAGE_API_KEY=sk-...
OPENAI_IMAGE_MODEL=gpt-image-2
AI_IMAGE_SIZE=1024x1536
AI_IMAGE_QUALITY=medium
AI_IMAGE_OUTPUT_FORMAT=webp
AI_IMAGE_STYLE=clean_education_card
```

For a compatible gateway:

```env
AI_IMAGE_PROVIDER=custom
CUSTOM_IMAGE_BASE_URL=https://your-gateway.example.com/v1
CUSTOM_IMAGE_API_KEY=...
CUSTOM_IMAGE_MODEL=gpt-image-2
```

Users can also configure image provider, model, key, base URL, size, quality, format, and card style from the profile page. Image files are stored outside `public/` and served through authenticated API routes.

Wrong-note image generation is asynchronous. Single and batch requests create tasks first, then a process-local worker queue runs image jobs with `AI_IMAGE_QUEUE_CONCURRENCY` concurrent workers. `AI_IMAGE_BATCH_MAX` controls the maximum wrong notes accepted by one batch request.

## Safety Notes

- Do not commit real API keys.
- Prefer HTTPS for remote custom endpoints.
- Rotate keys after testing public demos.
- Use provider rate limits to control cost.
