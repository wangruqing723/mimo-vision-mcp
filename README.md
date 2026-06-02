# mcp-server-mimo-vision

MCP server for image vision analysis using multimodal models (MiMo, Claude, GPT-4o, etc.).

## Why?

Claude Code's main model may not support multimodal (vision) input. This MCP server bridges the gap by calling a vision-capable model to analyze images and return text descriptions.

## Quick Start

### Option 1: npx (Recommended)

Add to `.mcp.json` in your project or `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["-y", "@ruqingwang/mcp-server-mimo-vision"],
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Option 2: One-click Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/wangruqing723/mimo-vision-mcp/main/install.sh | bash
```

### Option 3: Global Install

```bash
npm install -g @ruqingwang/mcp-server-mimo-vision
```

## Configuration

After install, all settings are in `~/.claude/vision-mcp.conf`:

```bash
ANTHROPIC_BASE_URL="https://your-proxy.com/anthropic"
ANTHROPIC_AUTH_TOKEN="your-token"
VISION_MODEL="mimo-v2.5"  # Change to any vision model
```

### Supported Models

Any model compatible with Anthropic Messages API that supports multimodal:

| Model | Description |
|-------|-------------|
| `mimo-v2.5` | MiMo multimodal (default) |
| `mimo-v2.5-pro` | MiMo Pro |
| `claude-sonnet-4-20250514` | Claude Sonnet |
| `gpt-4o` | GPT-4o (requires compatible proxy) |

### Environment Variables (override config file)

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_BASE_URL` | API proxy URL | `https://token-plan-cn.xiaomimimo.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | API auth token | **Required** |
| `VISION_MODEL` | Model name | `mimo-v2.5` |

### Image Input Modes

The `describe_image` and `ocr_image` tools accept:

1. **File path**: `/path/to/image.png`
2. **HTTP URL**: `https://example.com/img.jpg`
3. **Data URI**: `data:image/png;base64,...`
4. **Raw base64**: base64-encoded image string

### Auto-intercept Hook (Optional)

To automatically use vision MCP when Claude Code reads an image file, add a PreToolUse hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/hook-vision.sh",
            "statusMessage": "Analyzing image..."
          }
        ]
      }
    ]
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `describe_image` | Analyze image content, return text description |
| `ocr_image` | Extract text from image (OCR) |

## Usage

Once configured, just ask in Claude Code:

```
Look at /path/to/image.png and describe what's in it
```

```
Extract text from /path/to/screenshot.png
```

## GitHub

https://github.com/wangruqing723/mimo-vision-mcp

## License

MIT
