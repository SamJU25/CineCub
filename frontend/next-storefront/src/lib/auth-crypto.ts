// CineCub Zero-Dependency Edge WebCrypto Utilities for Passwords & JWT

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuffer(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function stringToBase64Url(str: string): string {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

function base64UrlToString(base64Url: string): string {
  return new TextDecoder().decode(base64UrlToBytes(base64Url));
}

/**
 * Hash password with PBKDF2-SHA256 and a random 16-byte salt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  return `${bufferToHex(salt)}:${bufferToHex(derivedBits)}`;
}

/**
 * Verify password against stored salt:hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  const salt = hexToBuffer(saltHex);
  const expectedHash = hexToBuffer(hashHex);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  const derivedArray = new Uint8Array(derivedBits);
  if (derivedArray.length !== expectedHash.length) return false;

  let mismatch = 0;
  for (let i = 0; i < derivedArray.length; i++) {
    mismatch |= derivedArray[i] ^ expectedHash[i];
  }
  return mismatch === 0;
}

export interface JWTPayload {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  photoURL?: string;
  exp?: number;
  iat?: number;
}

/**
 * Generate HMAC-SHA256 JWT
 */
export async function signJWT(
  payload: JWTPayload,
  secret?: string,
  expiresInSeconds: number = 30 * 24 * 60 * 60 // 30 days
): Promise<string> {
  const effectiveSecret = (secret || process.env.JWT_SECRET || "").trim();
  if (!effectiveSecret || effectiveSecret.length < 32) {
    throw new Error("JWT_SECRET is missing or insufficiently secure (minimum 32 characters required)");
  }

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = stringToBase64Url(JSON.stringify(header));
  const encodedPayload = stringToBase64Url(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(effectiveSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(dataToSign));
  const encodedSignature = bytesToBase64Url(new Uint8Array(signature));

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verify HMAC-SHA256 JWT and extract payload
 */
export async function verifyJWT(
  token: string,
  secret?: string
): Promise<JWTPayload | null> {
  try {
    const effectiveSecret = (secret || process.env.JWT_SECRET || "").trim();
    if (!effectiveSecret || effectiveSecret.length < 32) {
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(effectiveSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = base64UrlToBytes(encodedSignature);
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, enc.encode(dataToSign));
    if (!isValid) return null;

    const payloadText = base64UrlToString(encodedPayload);
    const payload = JSON.parse(payloadText) as JWTPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}
