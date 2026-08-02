import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_RESPONSE_BYTES = 2_000_000;

export function isPrivateIp(address: string) {
  const version = isIP(address);
  if (version === 0) return true;

  if (version === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized === "::"
  );
}

export async function assertPublicHost(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("Private or local network URLs are not allowed.");
  }
}

export async function readLimitedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`Response is larger than ${MAX_RESPONSE_BYTES} bytes.`);
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}
