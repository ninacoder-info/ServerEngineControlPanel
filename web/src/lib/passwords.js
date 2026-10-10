const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";

/** Generate a cryptographically random password for managed credentials. */
export function generateSecurePassword(length = 20) {
  const size = Math.max(12, Math.min(Number(length) || 20, 128));
  const values = new Uint32Array(size);
  globalThis.crypto.getRandomValues(values);
  return Array.from(
    values,
    (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length],
  ).join("");
}
