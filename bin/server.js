#!/usr/bin/env node

/**
 * MCP Server: MiMo Vision
 * Image vision analysis using MiMo multimodal model via Anthropic-compatible proxy.
 *
 * Environment variables:
 *   ANTHROPIC_BASE_URL  - API proxy URL (default: https://token-plan-cn.xiaomimimo.com/anthropic)
 *   ANTHROPIC_AUTH_TOKEN - API auth token (required)
 *   VISION_MODEL        - Model name (default: mimo-v2.5)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { request } from "node:https";

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

function callVisionAPI(imagePath, prompt) {
  return new Promise((resolvePromise, reject) => {
    const absPath = resolve(imagePath);
    if (!existsSync(absPath)) {
      return resolvePromise(`Error: file not found: ${absPath}`);
    }

    let buf;
    try {
      buf = readFileSync(absPath);
    } catch (e) {
      return resolvePromise(`Error reading file: ${e.message}`);
    }
    const b64 = buf.toString("base64");
    const mediaType = detectMediaType(absPath);

    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
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

    const req = request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.content && data.content[0] && data.content[0].text) {
            resolvePromise(data.content[0].text);
          } else {
            resolvePromise(
              `Unexpected API response: ${JSON.stringify(data).slice(0, 500)}`
            );
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

// --- MCP Server ---

const server = new McpServer({
  name: "mimo-vision",
  version: "1.0.0",
});

server.tool(
  "describe_image",
  "Analyze a local image file and return a text description of its content. Supports PNG, JPG, GIF, WEBP, BMP.",
  {
    image_path: z.string().describe("Absolute or relative path to the image file"),
    prompt: z
      .string()
      .optional()
      .default("请详细描述这张图片的内容")
      .describe("Question or instruction about the image"),
  },
  async ({ image_path, prompt }) => {
    const result = await callVisionAPI(image_path, prompt);
    return { content: [{ type: "text", text: result }] };
  }
);

server.tool(
  "ocr_image",
  "Extract all text content from an image (OCR).",
  {
    image_path: z.string().describe("Absolute or relative path to the image file"),
  },
  async ({ image_path }) => {
    const result = await callVisionAPI(
      image_path,
      "请提取这张图片中的所有文字内容，保持原始格式和布局。"
    );
    return { content: [{ type: "text", text: result }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
