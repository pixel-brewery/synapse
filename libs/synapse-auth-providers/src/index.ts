/**
 * Shared HTTP boundary for optional provider API-key authentication checks.
 *
 * Import concrete verifiers from the openai, anthropic, gemini, mistral or openrouter subpath.
 * Model execution belongs to the consuming application's Vercel AI SDK integration.
 *
 * @packageDocumentation
 */

export { ApiKeyVerificationTransportBase } from './abstracts/ApiKeyVerificationTransportBase.js';
export { NodeApiKeyVerificationTransport } from './services/NodeApiKeyVerificationTransport.js';
export type { IApiKeyVerificationRequest } from './interfaces/IApiKeyVerificationRequest.js';
export type { IApiKeyVerificationResponse } from './interfaces/IApiKeyVerificationResponse.js';
export type { INodeApiKeyVerificationTransportOptions } from './interfaces/INodeApiKeyVerificationTransportOptions.js';
