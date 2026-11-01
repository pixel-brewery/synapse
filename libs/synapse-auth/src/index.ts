/**
 * Public entry point for @pixel-brewery/synapse-auth.
 *
 * Isolated account profiles, native authentication and backend-managed API-key connections.
 *
 * @packageDocumentation
 */

export { ProfileManager } from './services/ProfileManager.js';
export { AuthManager } from './services/AuthManager.js';
export { ApiKeyAuthDriver } from './services/ApiKeyAuthDriver.js';
export { ApiKeyStoreBase } from './abstracts/ApiKeyStoreBase.js';
export { ApiKeyVerifierBase } from './abstracts/ApiKeyVerifierBase.js';
export { apiKeyCredentialScope } from './apiKeyCredentialScope.js';
export type { IApiKeyCredentialScope } from './interfaces/IApiKeyCredentialScope.js';
export type { IProfileManagerOptions } from './interfaces/IProfileManagerOptions.js';
export type { IProfileRequest } from './interfaces/IProfileRequest.js';
export type { IAuthHandle } from './interfaces/IAuthHandle.js';
export type { IAuthManagerOptions } from './interfaces/IAuthManagerOptions.js';
export type { IAuthStartOptions } from './interfaces/IAuthStartOptions.js';
export type { IAuthOperationIdentity } from './interfaces/IAuthOperationIdentity.js';
export type { AuthState } from './models/AuthState.js';
