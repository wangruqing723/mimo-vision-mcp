#!/usr/bin/env bash
#
# MiMo Vision MCP Server - 一键安装脚本
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/mimo-vision-mcp/main/install.sh | bash
#   或: bash install.sh
#
# 环境变量 (可选):
#   ANTHROPIC_BASE_URL  - API 代理地址 (默认: https://token-plan-cn.xiaomimimo.com/anthropic)
#   ANTHROPIC_AUTH_TOKEN - API 认证令牌 (必须)
#   VISION_MODEL        - 模型名称 (默认: mimo-v2.5)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# --- 检查依赖 ---
command -v node >/dev/null 2>&1 || error "需要 Node.js，请先安装: https://nodejs.org/"
command -v npm  >/dev/null 2>&1 || error "需要 npm，请先安装 Node.js"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || error "需要 Node.js >= 18，当前版本: $(node -v)"

# --- 交互式配置 ---
echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  MiMo Vision MCP Server 安装${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

# API 代理地址
DEFAULT_URL="${ANTHROPIC_BASE_URL:-https://token-plan-cn.xiaomimimo.com/anthropic}"
if [ -z "$ANTHROPIC_BASE_URL" ]; then
  echo -e "API 代理地址 (回车使用默认):"
  echo -e "  默认: ${CYAN}$DEFAULT_URL${NC}"
  read -r -p "> " INPUT_URL
  BASE_URL="${INPUT_URL:-$DEFAULT_URL}"
else
  BASE_URL="$DEFAULT_URL"
fi

# Auth Token
AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ]; then
  echo ""
  echo -e "API Auth Token (必填):"
  read -r -p "> " AUTH_TOKEN
  [ -n "$AUTH_TOKEN" ] || error "Auth Token 不能为空"
fi

# 模型名称
DEFAULT_MODEL="${VISION_MODEL:-mimo-v2.5}"
echo ""
echo -e "视觉模型名称 (回车使用默认):"
echo -e "  默认: ${CYAN}$DEFAULT_MODEL${NC}"
echo -e "  可选: mimo-v2.5, mimo-v2.5-pro, gpt-4o, claude-sonnet-4-20250514 等"
read -r -p "> " INPUT_MODEL
VISION_MODEL="${INPUT_MODEL:-$DEFAULT_MODEL}"

echo ""
echo -e "${CYAN}── 配置确认 ──${NC}"
echo "  代理地址: $BASE_URL"
echo "  Auth Token: ${AUTH_TOKEN:0:8}****"
echo "  视觉模型: $VISION_MODEL"
echo ""
read -r -p "确认安装? (Y/n) " CONFIRM
[[ "$CONFIRM" =~ ^[Nn] ]] && exit 0

# --- 安装 ---
INSTALL_DIR="$HOME/.claude/mcp-servers/mimo-vision"
info "安装到 $INSTALL_DIR ..."

mkdir -p "$INSTALL_DIR/bin"
cd "$INSTALL_DIR"

# 创建 package.json（如果是通过 curl | bash 运行）
if [ ! -f package.json ]; then
  cat > package.json << 'PKGJSON'
{
  "name": "mcp-server-mimo-vision",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0"
  }
}
PKGJSON
fi

# 复制 server.js（如果是从源码目录运行）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/bin/server.js" ] && [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  cp "$SCRIPT_DIR/bin/server.js" "$INSTALL_DIR/bin/server.js"
fi

info "安装依赖 ..."
npm install --production 2>/dev/null

# --- 写入配置文件 ---
CONF_FILE="$HOME/.claude/vision-mcp.conf"
cat > "$CONF_FILE" << CONFEOF
# MiMo Vision MCP Server 配置文件
# 修改此文件即可切换模型或代理，无需重新安装

ANTHROPIC_BASE_URL="$BASE_URL"
ANTHROPIC_AUTH_TOKEN="$AUTH_TOKEN"
VISION_MODEL="$VISION_MODEL"
CONFEOF
info "配置文件已写入 $CONF_FILE"

# --- 生成启动脚本 ---
cat > "$INSTALL_DIR/start.sh" << 'STARTEOF'
#!/usr/bin/env bash
# MiMo Vision MCP Server 启动脚本
# 配置来自 ~/.claude/vision-mcp.conf，环境变量优先级更高

CONF="$HOME/.claude/vision-mcp.conf"
[ -f "$CONF" ] && source "$CONF"

export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://token-plan-cn.xiaomimimo.com/anthropic}"
export ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-}"
export VISION_MODEL="${VISION_MODEL:-mimo-v2.5}"

exec node "$(dirname "$0")/bin/server.js"
STARTEOF
chmod +x "$INSTALL_DIR/start.sh"

# --- 生成 Hook 脚本 ---
cat > "$INSTALL_DIR/hook-vision.sh" << 'HOOKEOF'
#!/usr/bin/env bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try{ const j=JSON.parse(d); console.log(j.tool_input?.file_path||''); }catch{ console.log(''); }
  })
" 2>/dev/null)

EXT="${FILE_PATH##*.}"
EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

case "$EXT_LOWER" in
  png|jpg|jpeg|gif|webp|bmp|svg)
    ABS_PATH=$(realpath "$FILE_PATH" 2>/dev/null || echo "$FILE_PATH")
    RESULT=$(printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hook","version":"0.1"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"describe_image","arguments":{"image_path":"%s","prompt":"请详细描述这张图片的内容"}}}\n' "$ABS_PATH" | bash INSTALL_DIR_PLACEHOLDER/start.sh 2>/dev/null)
    DESCRIPTION=$(echo "$RESULT" | node -e "
      let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
        for(const line of d.split('\n')){
          if(!line.trim()) continue;
          try{ const j=JSON.parse(line); if(j.id===2&&j.result?.content){ console.log(j.result.content[0]?.text||''); break; } }catch{}
        }
      })
    " 2>/dev/null)
    if [ -n "$DESCRIPTION" ]; then
      ESCAPED=$(echo "$DESCRIPTION" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(d).slice(1,-1)))")
      echo "{\"decision\":\"block\",\"reason\":\"[Vision MCP] 图片内容分析结果：\\n\\n$ESCAPED\"}"
    else
      echo '{"decision":"block","reason":"[Vision MCP] 图片识别服务调用失败，请检查配置。"}'
    fi
    ;;
  *)
    echo '{"decision":"allow"}'
    ;;
esac
HOOKEOF
sed -i "s|INSTALL_DIR_PLACEHOLDER|$INSTALL_DIR|g" "$INSTALL_DIR/hook-vision.sh"
chmod +x "$INSTALL_DIR/hook-vision.sh"

# --- 配置 Claude Code MCP ---
MCP_JSON="$HOME/.claude/.mcp.json"
if [ -f "$MCP_JSON" ]; then
  node -e "
    const fs = require('fs');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync('$MCP_JSON','utf8')); } catch {}
    cfg.mcpServers = cfg.mcpServers || {};
    cfg.mcpServers.vision = { command: '$INSTALL_DIR/start.sh' };
    fs.writeFileSync('$MCP_JSON', JSON.stringify(cfg, null, 2));
  "
else
  mkdir -p "$(dirname "$MCP_JSON")"
  cat > "$MCP_JSON" << MCPJSON
{
  "mcpServers": {
    "vision": {
      "command": "$INSTALL_DIR/start.sh"
    }
  }
}
MCPJSON
fi
info "MCP 配置已写入 $MCP_JSON"

# --- 完成 ---
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  安装完成！${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "配置文件: $CONF_FILE"
echo "  修改模型: 编辑 VISION_MODEL 字段"
echo "  修改代理: 编辑 ANTHROPIC_BASE_URL 字段"
echo "  修改令牌: 编辑 ANTHROPIC_AUTH_TOKEN 字段"
echo ""
echo -e "${YELLOW}还需要手动添加 Hook 到 ~/.claude/settings.json:${NC}"
echo ""
echo '  ,"hooks": {'
echo '    "PreToolUse": [{'
echo '      "matcher": "Read",'
echo '      "hooks": [{'
echo "        \"type\": \"command\","
echo "        \"command\": \"$INSTALL_DIR/hook-vision.sh\","
echo '        "statusMessage": "正在识别图片内容..."'
echo '      }]'
echo '    }]'
echo '  }'
echo ""
echo "然后重启 Claude Code 即可使用！"
echo ""
