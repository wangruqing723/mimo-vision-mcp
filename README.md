# mcp-server-mimo-vision

MiMo Vision MCP Server — 让 Claude Code 支持图片识别和 OCR，通过 MiMo 多模态模型实现。

## 为什么需要这个？

Claude Code 的主模型如果不支持多模态（如 mimo-v2.5-pro），就无法直接读取图片。这个 MCP 服务器通过调用支持视觉的 MiMo 模型来分析图片，然后以文本形式返回结果。

## 快速安装

### 方式一：一键脚本

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/mimo-vision-mcp/main/install.sh | bash
```

或手动下载运行：

```bash
# 下载
git clone https://github.com/YOUR_USER/mimo-vision-mcp.git
cd mimo-vision-mcp

# 设置环境变量
export ANTHROPIC_AUTH_TOKEN="your-token-here"

# 安装
bash install.sh
```

### 方式二：npx（推荐已安装 Node.js 的用户）

```bash
npx mcp-server-mimo-vision
```

### 方式三：npm 全局安装

```bash
npm install -g mcp-server-mimo-vision
mcp-server-mimo-vision
```

## 配置

安装后，所有配置集中在 `~/.claude/vision-mcp.conf` 文件中，修改即生效，无需重启安装：

```bash
# ~/.claude/vision-mcp.conf
ANTHROPIC_BASE_URL="https://token-plan-cn.xiaomimimo.com/anthropic"
ANTHROPIC_AUTH_TOKEN="your-token-here"
VISION_MODEL="mimo-v2.5"          # 改成你想用的视觉模型
```

### 支持的模型

任何兼容 Anthropic Messages API 且支持多模态的模型都可以，例如：

| 模型 | 说明 |
|------|------|
| `mimo-v2.5` | MiMo 多模态模型（默认） |
| `mimo-v2.5-pro` | MiMo Pro（如果支持视觉） |
| `claude-sonnet-4-20250514` | Claude Sonnet |
| `gpt-4o` | GPT-4o（需对应代理支持） |

### 环境变量（优先级更高）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_BASE_URL` | API 代理地址 | `https://token-plan-cn.xiaomimimo.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | API 认证令牌 | **必须设置** |
| `VISION_MODEL` | 模型名称 | `mimo-v2.5` |

### Claude Code MCP 配置

在 `~/.claude/.mcp.json` 或项目 `.mcp.json` 中添加：

```json
{
  "mcpServers": {
    "vision": {
      "command": "npx",
      "args": ["mcp-server-mimo-vision"],
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

### 图片读取自动拦截（Hook）

为了在 Claude Code 读取图片时自动调用 vision MCP，需要在 `~/.claude/settings.json` 中添加 Hook：

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
            "statusMessage": "正在识别图片内容..."
          }
        ]
      }
    ]
  }
}
```

## 提供的工具

| 工具 | 说明 |
|------|------|
| `describe_image` | 分析图片内容，返回文字描述 |
| `ocr_image` | 从图片中提取文字（OCR） |

## 使用示例

安装配置完成后，直接在 Claude Code 中说：

```
帮我看看 /path/to/image.png 这张图片的内容
```

```
提取截图 /path/to/screenshot.png 中的文字
```

## 工作原理

```
用户: "看看这张图片"
  → Claude Code (mimo-v2.5-pro) 尝试读取图片
  → Hook 拦截，检测到是图片文件
  → 调用 vision MCP 服务器
  → MCP 服务器将图片 base64 编码，发送给 mimo-v2.5 多模态模型
  → 返回图片描述文本
  → Claude Code 展示结果
```

## 许可证

MIT
