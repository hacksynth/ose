import { NextResponse } from "next/server";

type AIErrorDetails = {
  message: string;
  status: number;
};

export function getSanitizedEndpoint(rawUrl: string | undefined, fallbackUrl: string) {
  const value = rawUrl?.trim() || fallbackUrl;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "(invalid endpoint)";
  }
}

export function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "AI 服务暂时不可用，请稍后再试。";
}

function getErrorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") return error.status;
  if (error && typeof error === "object" && "cause" in error && error.cause && typeof error.cause === "object" && "status" in error.cause && typeof error.cause.status === "number") return error.cause.status;
  return undefined;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  if (error && typeof error === "object" && "cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause && typeof error.cause.code === "string") return error.cause.code;
  return undefined;
}

export function getAIErrorDetails(error: unknown): AIErrorDetails {
  const message = normalizeErrorMessage(error);
  const normalized = message.toLowerCase();
  const status = getErrorStatus(error);
  const code = getErrorCode(error)?.toLowerCase();

  if (status === 401 || status === 403 || code === "invalid_api_key" || normalized.includes("authentication") || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return { message: "AI 服务认证失败，请检查 API Key", status: 401 };
  }

  if ((status === 404 && normalized.includes("model")) || (normalized.includes("model") && (normalized.includes("not found") || normalized.includes("does not exist") || normalized.includes("unavailable")))) {
    return { message: "指定的模型不可用，请检查 CUSTOM_MODEL 配置", status: 400 };
  }

  if (code === "etimedout" || code === "econnrefused" || code === "enotfound" || code === "ehostunreach" || normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("fetch failed") || normalized.includes("connection error") || normalized.includes("network error") || normalized.includes("econnrefused")) {
    return { message: "无法连接到 AI 服务，请检查服务是否运行", status: 503 };
  }

  return { message, status: status ?? 502 };
}

export function createAIErrorResponse(error: unknown) {
  const details = getAIErrorDetails(error);
  return NextResponse.json({ message: details.message }, { status: details.status });
}

type AbortableIterable<T> = AsyncIterable<T> & {
  return?: (value?: unknown) => Promise<IteratorResult<T>>;
};

export function streamText(iterator: AsyncIterable<string>) {
  const encoder = new TextEncoder();
  const typed = iterator as AbortableIterable<string>;
  let iter: AsyncIterator<string> | null = null;
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        iter = typed[Symbol.asyncIterator]();
        while (true) {
          const { value, done } = await iter.next();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`\n\n${getAIErrorDetails(error).message}`));
      } finally {
        controller.close();
      }
    },
    async cancel() {
      try {
        await iter?.return?.();
      } catch {
        // ignore
      }
    },
  }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export function cleanJsonText(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

export function extractImageUrls(content: string): string[] {
  const urls: string[] = [];
  const imgTagRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgTagRegex.exec(content)) !== null) {
    try {
      const url = new URL(match[1]);
      if (url.protocol === "http:" || url.protocol === "https:") urls.push(match[1]);
    } catch { /* skip invalid */ }
  }
  const markdownImgRegex = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  while ((match = markdownImgRegex.exec(content)) !== null) {
    try {
      const url = new URL(match[1]);
      if (url.protocol === "http:" || url.protocol === "https:") urls.push(match[1]);
    } catch { /* skip invalid */ }
  }
  return [...new Set(urls)];
}

export async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim() || "image/jpeg";
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType };
  } catch {
    return null;
  }
}
