import { NextRequest, NextResponse } from "next/server.js";
import { assertPublicHost, MAX_RESPONSE_BYTES, readLimitedText } from "../../../lib/fetch-safety.ts";

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { url } = body;

  if (!url) {
    return NextResponse.json({ error: "A URL is required." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Please provide a valid URL." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only HTTP and HTTPS URLs are supported." }, { status: 400 });
  }

  try {
    await assertPublicHost(parsed.hostname);
  } catch (error) {
    const message = error instanceof Error ? error.message : "This host cannot be fetched.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 HTML-to-Figma-Design/0.1"
      },
      signal: controller.signal,
      next: { revalidate: 0 }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch this URL.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    return NextResponse.json({ error: `Response is larger than ${MAX_RESPONSE_BYTES} bytes.` }, { status: 413 });
  }

  let text: string;
  try {
    text = await readLimitedText(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Response could not be read.";
    return NextResponse.json({ error: message }, { status: 413 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: `Fetch failed with ${response.status}.`, body: text.slice(0, 400) }, { status: 502 });
  }

  return NextResponse.json({
    url: parsed.toString(),
    contentType,
    body: text
  });
}
