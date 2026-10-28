import os
from dataclasses import dataclass, field

import httpx
from fastapi import HTTPException


@dataclass(frozen=True)
class AIConfig:
    api_key: str = field(repr=False)
    model: str
    base_url: str = field(repr=False)
    missing: tuple[str, ...]

    def require(self):
        if self.missing:
            message = "请将 .env.example 复制为 .env，填写 LLM_API_KEY 和 LLM_MODEL 后重启后端。"
            if "LLM_BASE_URL" in self.missing:
                message += " 请将 LLM_BASE_URL 设置为有效的 HTTP(S) API 地址，不含账号密码、查询参数或片段。"
            raise HTTPException(503, {"code": "AI_NOT_CONFIGURED", "message": message})
        return self


def read_ai_config():
    key = os.getenv("LLM_API_KEY", "").strip()
    model = os.getenv("LLM_MODEL", "").strip()
    base = (os.getenv("LLM_BASE_URL", "").strip() or "https://api.openai.com/v1").rstrip("/")
    missing = [name for name, value in (("LLM_API_KEY", key), ("LLM_MODEL", model))
               if not value]
    try:
        url = httpx.URL(base)
        if (url.scheme not in ("http", "https") or not url.host
                or url.userinfo or url.query or url.fragment
                or (url.port is not None and not 1 <= url.port <= 65535)
                or any(character.isspace() for character in base)):
            raise ValueError("Invalid base URL")
    except (httpx.InvalidURL, ValueError):
        missing.append("LLM_BASE_URL")
    return AIConfig(key, model, base, tuple(missing))
