/**
 * BYOK API Key Encryption
 *
 * AES-256-GCM encryption for API keys stored in the database.
 * Keys are encrypted with a derived key from EMDASH_SECRET via HKDF-SHA256.
 *
 * Storage format: `{iv}:{authTag}:{ciphertext}` (all base64-encoded).
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HKDF_INFO = "openemdash-api-keys";
const HKDF_HASH = "sha256";

/**
 * Derive a 256-bit encryption key from the application secret using HKDF-SHA256.
 */
function deriveKey(secret: string): Buffer {
	return Buffer.from(hkdfSync(HKDF_HASH, secret, "", HKDF_INFO, KEY_LENGTH));
}

/**
 * Validate that required inputs are present. Throws a descriptive error if not.
 */
function assertNonEmpty(value: string, label: string): void {
	if (!value) {
		throw new Error(`${label} must not be empty`);
	}
}

/**
 * Encrypt an API key for database storage.
 *
 * Uses AES-256-GCM with a random 12-byte IV. The encryption key is derived
 * from `secret` via HKDF-SHA256 with the info string "openemdash-api-keys".
 *
 * @returns Encoded string in the format `{iv}:{authTag}:{ciphertext}` (base64).
 */
export function encryptApiKey(plaintext: string, secret: string): string {
	assertNonEmpty(plaintext, "API key");
	assertNonEmpty(secret, "Encryption secret");

	const key = deriveKey(secret);
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
		":",
	);
}

/**
 * Decrypt an API key from its stored format.
 *
 * Expects the `{iv}:{authTag}:{ciphertext}` format produced by `encryptApiKey`.
 *
 * @returns The original plaintext API key.
 * @throws If the encrypted string is malformed, the secret is wrong, or the data has been tampered with.
 */
export function decryptApiKey(encrypted: string, secret: string): string {
	assertNonEmpty(encrypted, "Encrypted value");
	assertNonEmpty(secret, "Encryption secret");

	const parts = encrypted.split(":");
	if (parts.length !== 3) {
		throw new Error("Invalid encrypted format: expected {iv}:{authTag}:{ciphertext}");
	}

	const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];
	const iv = Buffer.from(ivB64, "base64");
	const authTag = Buffer.from(authTagB64, "base64");
	const ciphertext = Buffer.from(ciphertextB64, "base64");

	if (iv.length !== IV_LENGTH) {
		throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
	}
	if (authTag.length !== AUTH_TAG_LENGTH) {
		throw new Error(
			`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`,
		);
	}

	const key = deriveKey(secret);

	const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return decrypted.toString("utf8");
}

/**
 * Mask an API key for display, showing only the last 4 characters.
 *
 * @returns `****...last4` or `****` if the key is too short.
 */
export function maskApiKey(key: string): string {
	if (!key) {
		return "****";
	}
	if (key.length <= 4) {
		return "****";
	}
	return `****...${key.slice(-4)}`;
}
