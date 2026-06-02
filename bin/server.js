#!/usr/bin/env node

/**
 * MCP Server: MiMo Vision
 * Image vision analysis using multimodal model via Anthropic-compatible proxy.
 *
 * Supports three image input modes:
 *   1. File path (local file)
 *   2. Base64 data (raw or data URI)
 *   3. Image URL (http/https)
 *
 * Environment variables:
 *   ANTHROPIC_BASE_URL  - API proxy URL (default: https://token-plan-cn.xiaomimimo.com/anthropic)
 *   ANTHROPIC_AUTH_TOKEN - API auth token (required)
 *   VISION_MODEL        - Model name (default: mimo-v2.5)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, extname, join } from "node:path";
import { request as httpsRequest } from "node:https";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const BASE_URL = (
  process.env.ANTHROPIC_BASE_URL ||
  "https://token-plan-cn.xiaomimimo.com/anthropic"
).replace(/\/+$/, "");
const AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || "";
const MODEL = process.env.VISION_MODEL || "mimo-v2.5";

const MIME_MAP = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

function detectMediaType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "image/png";
}

/**
 * Resolve image input into { base64, mediaType }
 * Supports: file path, base64 string, data URI, http/https URL
 */
async function resolveImage(input) {
  // 1. Data URI: data:image/png;base64,xxxxx
  if (input.startsWith("data:")) {
    const match = input.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { base64: match[2], mediaType: match[1] };
    }
    throw new Error("Invalid data URI format");
  }

  // 2. HTTP/HTTPS URL
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const resp = await fetch(input, {
      signal: AbortSignal.timeout(30_000),
      redirect: "follow",
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get("content-type") || "image/png";
    return {
      base64: buf.toString("base64"),
      mediaType: ct.split(";")[0].trim(),
    };
  }

  // 3. Raw base64 string (no file extension, no URL prefix)
  if (/^[A-Za-z0-9+/=\n\r]+$/.test(input.slice(0, 100)) && input.length > 200) {
    // Looks like raw base64
    const clean = input.replace(/[\n\r\s]/g, "");
    // Try to detect format from magic bytes
    const buf = Buffer.from(clean, "base64");
    let mediaType = "image/png";
    if (buf[0] === 0xff && buf[1] === 0xd8) mediaType = "image/jpeg";
    else if (buf[0] === 0x89 && buf[1] === 0x50) mediaType = "image/png";
    else if (buf[0] === 0x47 && buf[1] === 0x49) mediaType = "image/gif";
    else if (buf[0] === 0x52 && buf[1] === 0x49) mediaType = "image/webp";
    return { base64: clean, mediaType };
  }

  // 4. File path
  const absPath = resolve(input);
  if (!existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  const buf = readFileSync(absPath);
  return {
    base64: buf.toString("base64"),
    mediaType: detectMediaType(absPath),
  };
}

function callVisionAPI(imageData, mediaType, prompt) {
  return new Promise((resolvePromise) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageData },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const url = new URL(`${BASE_URL}/v1/messages`);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "x-api-key": AUTH_TOKEN,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    };

    const req = httpsRequest(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.content && data.content[0] && data.content[0].text) {
            resolvePromise(data.content[0].text);
          } else if (data.error) {
            resolvePromise(`API Error: ${data.error.message || JSON.stringify(data.error)}`);
          } else {
            resolvePromise(`Unexpected response: ${JSON.stringify(data).slice(0, 500)}`);
          }
        } catch (e) {
          resolvePromise(`Parse error: ${e.message}`);
        }
      });
    });

    req.on("error", (e) => resolvePromise(`Request error: ${e.message}`));
    req.setTimeout(120_000, () => {
      req.destroy();
      resolvePromise("Error: request timeout (120s)");
    });
    req.write(body);
    req.end();
  });
}

// Unified handler
async function handleVision(input, prompt) {
  try {
    const { base64, mediaType } = await resolveImage(input);
    return await callVisionAPI(base64, mediaType, prompt);
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// --- MCP Server ---

const server = new McpServer({
  name: "mimo-vision",
  version: "1.1.0",
});

const imageInputDesc =
  "Image input. Supports: " +
  "1) File path (absolute or relative, e.g. '/path/to/image.png'), " +
  "2) HTTP/HTTPS URL (e.g. 'https://example.com/img.jpg'), " +
  "3) Base64 data URI (e.g. 'data:image/png;base64,...'), " +
  "4) Raw base64 string.";

server.tool(
  "describe_image",
  "Analyze an image and return a text description. Accepts file path, URL, base64 data URI, or raw base64.",
  {
    image: z.string().describe(imageInputDesc),
    prompt: z
      .string()
      .optional()
      .default("请详细描述这张图片的内容")
      .describe("Question or instruction about the image"),
  },
  async ({ image, prompt }) => {
    const result = await handleVision(image, prompt);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "ocr_image",
  "Extract all text content from an image (OCR). Accepts file path, URL, base64 data URI, or raw base64.",
  {
    image: z.string().describe(imageInputDesc),
  },
  async ({ image }) => {
    const result = await handleVision(
      image,
      "请提取这张图片中的所有文字内容，保持原始格式和布局。"
    );
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "clipboard_vision",
  "Analyze the image currently in the system clipboard. Saves clipboard image to temp file, then analyzes it with the vision model.",
  {
    prompt: z
      .string()
      .optional()
      .default("请详细描述这张图片的内容")
      .describe("Question or instruction about the image"),
  },
  async ({ prompt }) => {
    const tmpFile = join(tmpdir(), `clipboard-${Date.now()}.png`);
    try {
      // Try multiple clipboard tools
      const tools = [
        { cmd: `xclip -selection clipboard -t image/png -o`, check: "xclip" },
        { cmd: `wl-paste --type image/png`, check: "wl-paste" },
        { cmd: `pngpaste`, check: "pngpaste" },
      ];

      let saved = false;

      // Try Linux/Mac clipboard tools
      for (const tool of tools) {
        try {
          execSync(`command -v ${tool.check}`, { stdio: "ignore" });
          execSync(`${tool.cmd} > "${tmpFile}" 2>/dev/null`, { stdio: "ignore" });
          if (existsSync(tmpFile) && readFileSync(tmpFile).length > 100) {
            saved = true;
            break;
          }
        } catch {}
      }

      // Try WSL powershell
      if (!saved) {
        try {
          execSync(`command -v powershell.exe`, { stdio: "ignore" });
          const winPath = execSync(`wslpath -w "${tmpFile}"`, { encoding: "utf8" }).trim();
          execSync(
            `powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; ` +
            `$img=[System.Windows.Forms.Clipboard]::GetImage(); ` +
            `if($img){$img.Save('${winPath}',[System.Drawing.Imaging.ImageFormat]::Png);'OK'}"`,
            { encoding: "utf8", timeout: 10000 }
          );
          if (existsSync(tmpFile) && readFileSync(tmpFile).length > 100) {
            saved = true;
          }
        } catch {}
      }

      if (!saved) {
        return {
          content: [{ type: "text", text: "Error: No image found in clipboard, or no clipboard tool available. Install xclip (Linux), pngpaste (macOS), or use on WSL with powershell.exe." }],
        };
      }

      const result = await handleVision(tmpFile, prompt);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Clipboard error: ${e.message}` }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
