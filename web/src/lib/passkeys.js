function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function toBase64Url(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function browserCredential(credential) {
  const response = credential.response;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      ...(response.attestationObject
        ? {
            attestationObject: toBase64Url(response.attestationObject),
            transports: response.getTransports?.() || [],
          }
        : {
            authenticatorData: toBase64Url(response.authenticatorData),
            signature: toBase64Url(response.signature),
            userHandle: response.userHandle ? toBase64Url(response.userHandle) : null,
          }),
    },
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
  };
}

export function passkeyAvailability() {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !navigator.credentials) {
    return { available: false, reason: "This browser does not support passkeys." };
  }
  const hostname = window.location.hostname;
  const isIpAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
  if (isIpAddress) {
    return { available: false, reason: "Passkeys become available after this panel has a hostname and HTTPS." };
  }
  if (!window.isSecureContext && hostname !== "localhost") {
    return { available: false, reason: "Passkeys require HTTPS outside localhost." };
  }
  return { available: true, reason: "" };
}

export function supportsPasskeys() {
  return passkeyAvailability().available;
}

export async function createPasskey(options) {
  const publicKey = {
    ...options,
    challenge: fromBase64Url(options.challenge),
    user: { ...options.user, id: fromBase64Url(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((item) => ({
      ...item,
      id: fromBase64Url(item.id),
    })),
  };
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error("Passkey registration was cancelled.");
  return browserCredential(credential);
}

export async function getPasskey(options) {
  const publicKey = {
    ...options,
    challenge: fromBase64Url(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((item) => ({
      ...item,
      id: fromBase64Url(item.id),
    })),
  };
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error("Passkey sign-in was cancelled.");
  return browserCredential(credential);
}
