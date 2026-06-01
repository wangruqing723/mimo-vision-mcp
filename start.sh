#!/usr/bin/env bash
# MiMo Vision MCP Server 启动脚本
# 可通过环境变量或 ~/.claude/vision-mcp.conf 配置文件覆盖默认值

CONF="$HOME/.claude/vision-mcp.conf"
[ -f "$CONF" ] && source "$CONF"

export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://token-plan-cn.xiaomimimo.com/anthropic}"
export ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-}"
export VISION_MODEL="${VISION_MODEL:-mimo-v2.5}"

exec node "$(dirname "$0")/bin/server.js"
