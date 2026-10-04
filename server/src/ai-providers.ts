/**
 * AI Provider Configurations
 *
 * All supported providers with their API endpoints, default models,
 * and free tier information. Most use OpenAI-compatible APIs.
 */

export interface AIProviderConfig {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  freeModels: string[];
  rateLimit: string;
  creditCard: boolean;
  openaiCompatible: boolean;
  headerFormat: "bearer" | "x-api-key" | "authorization";
  website: string;
  setupUrl: string;
}

export const AI_PROVIDERS: Record<string, AIProviderConfig> = {
  // ─── Free Providers ──────────────────────────────────────
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    description: "Free tier with 1M context window. Best for long-form analysis.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.0-flash",
    freeModels: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"],
    rateLimit: "15 RPM, 1,500/day",
    creditCard: false,
    openaiCompatible: false,
    headerFormat: "bearer",
    website: "https://aistudio.google.com",
    setupUrl: "https://aistudio.google.com/apikey",
  },

  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    description: "Free models from multiple providers. Single API key, OpenAI-compatible.",
    baseUrl: "https://openrouter.ai/api/v1",
    // VERIFIED LIVE against the OpenRouter API: this model accepts
    // OpenAI-style `tools` and returns correct `tool_calls` (checked with
    // a two-step agentic run, not a single completion).
    //
    // The previous default, meta-llama/llama-3.3-70b-instruct:free, no
    // longer exists as a free model — OpenRouter retired it and returns
    // HTTP 404 "This model is unavailable for free", which took the whole
    // assistant down. The roster below was stale for the same reason, so
    // treat it as a hint and re-check /api/v1/models before trusting it.
    defaultModel: "qwen/qwen3.8-27b:free",
    freeModels: [
      "qwen/qwen3.8-27b:free",
      "dots-studio/dots-3-note-preview:free",
      "cohere/north-mini-code:free",
      "inclusionai/ling-3.1-flash",
      "nvidia/nemotron-3.5-lightning:free",
    ],
    rateLimit: "20 RPM, 50/day (1,000/day with $10 top-up)",
    creditCard: false,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://openrouter.ai",
    setupUrl: "https://openrouter.ai/keys",
  },

  groq: {
    id: "groq",
    name: "Groq",
    description: "Fastest inference (320 tok/s). Free tier for Llama 3.3 70B.",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    freeModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    rateLimit: "30 RPM, 1,000/day",
    creditCard: false,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://groq.com",
    setupUrl: "https://console.groq.com/keys",
  },

  cerebras: {
    id: "cerebras",
    name: "Cerebras",
    description: "High throughput, ~1M tokens/day free. Great for batch processing.",
    baseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    freeModels: ["llama-3.3-70b", "llama-3.1-8b", "qwen-2.5-32b"],
    rateLimit: "30 RPM, ~1M tokens/day",
    creditCard: false,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://cerebras.ai",
    setupUrl: "https://cloud.cerebras.ai",
  },

  mistral: {
    id: "mistral",
    name: "Mistral",
    description: "~1B tokens/month free. Requires data training opt-in.",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    freeModels: ["mistral-small-latest", "mistral-large-latest", "codestral-latest", "open-mistral-nemo"],
    rateLimit: "~1B tokens/month",
    creditCard: false,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://mistral.ai",
    setupUrl: "https://console.mistral.ai/api-keys",
  },

  github: {
    id: "github",
    name: "GitHub Models",
    description: "Free GPT-4o, Claude, Llama access via GitHub account.",
    baseUrl: "https://models.inference.ai.azure.com",
    defaultModel: "gpt-4o-mini",
    freeModels: ["gpt-4o-mini", "gpt-4o", "claude-3.5-sonnet", "llama-3.3-70b", "phi-3.5-mini"],
    rateLimit: "15 RPM, 150-1,000/day",
    creditCard: false,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://github.com/marketplace/models",
    setupUrl: "https://github.com/settings/tokens",
  },

  cohere: {
    id: "cohere",
    name: "Cohere",
    description: "Command R+ free tier. Best for RAG and search-augmented generation.",
    baseUrl: "https://api.cohere.com/v2",
    defaultModel: "command-r-plus",
    freeModels: ["command-r-plus", "command-r", "command-light"],
    rateLimit: "10-20 RPM, ~100/day",
    creditCard: false,
    openaiCompatible: false,
    headerFormat: "bearer",
    website: "https://cohere.com",
    setupUrl: "https://dashboard.cohere.com/api-keys",
  },

  nvidia: {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "Free access to Nemotron and Llama variants. High throughput.",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "nvidia/llama-3.1-nemotron-70b-instruct",
    freeModels: ["nvidia/llama-3.1-nemotron-70b-instruct", "meta/llama-3.3-70b-instruct", "nvidia/nemotron-mini-4b-instruct"],
    rateLimit: "~1,000/day",
    creditCard: false,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://build.nvidia.com",
    setupUrl: "https://build.nvidia.com",
  },

  cloudflare: {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    description: "20+ models at the edge. Great for low latency.",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp16",
    freeModels: ["@cf/meta/llama-3.3-70b-instruct-fp16", "@cf/meta/llama-3.1-8b-instruct", "@cf/qwen/qwen1.5-14b-chat-awq"],
    rateLimit: "~10K neurons/day",
    creditCard: false,
    openaiCompatible: false,
    headerFormat: "bearer",
    website: "https://developers.cloudflare.com/workers-ai",
    setupUrl: "https://dash.cloudflare.com/profile/api-tokens",
  },

  // ─── Paid Providers (with free trial) ────────────────────
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o, GPT-4o-mini. Industry standard. $1 trial credit.",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    freeModels: ["gpt-4o-mini"],
    rateLimit: "Paid per token",
    creditCard: true,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://openai.com",
    setupUrl: "https://platform.openai.com/api-keys",
  },

  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Claude 3.5 Haiku, Sonnet. Best reasoning. $5 trial credit.",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-haiku-20240307",
    freeModels: ["claude-3-haiku-20240307"],
    rateLimit: "Paid per token",
    creditCard: true,
    openaiCompatible: false,
    headerFormat: "x-api-key",
    website: "https://anthropic.com",
    setupUrl: "https://console.anthropic.com",
  },

  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    description: "10M tokens free trial. Excellent at reasoning and code.",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    freeModels: ["deepseek-chat", "deepseek-reasoner"],
    rateLimit: "10M tokens trial",
    creditCard: false,
    openaiCompatible: true,
    headerFormat: "bearer",
    website: "https://deepseek.com",
    setupUrl: "https://platform.deepseek.com/api_keys",
  },

  // ─── Local ───────────────────────────────────────────────
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally. No API key needed. Requires 2GB+ RAM.",
    baseUrl: "http://127.0.0.1:11434",
    defaultModel: "qwen2.5:1.5b",
    freeModels: ["qwen2.5:0.5b", "qwen2.5:1.5b", "qwen2.5:3b", "llama3.2:1b", "llama3.2:3b", "phi3:mini", "gemma2:2b"],
    rateLimit: "Unlimited (local hardware)",
    creditCard: false,
    openaiCompatible: false,
    headerFormat: "bearer",
    website: "https://ollama.com",
    setupUrl: "https://ollama.com/download",
  },
};

/**
 * Get provider config by ID
 */
export function getProvider(id: string): AIProviderConfig | undefined {
  return AI_PROVIDERS[id];
}

/**
 * Get all providers as an array
 */
export function getAllProviders(): AIProviderConfig[] {
  return Object.values(AI_PROVIDERS);
}

/**
 * Get free providers only
 */
export function getFreeProviders(): AIProviderConfig[] {
  return Object.values(AI_PROVIDERS).filter((p) => !p.creditCard);
}
