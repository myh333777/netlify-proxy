// netlify/edge-functions/api-proxy.ts
// 极速 API 中转 - 零缓存、零处理、纯透传
import type { Context } from "@netlify/edge-functions";

// API 代理配置
const CONFIG: Record<string, string> = {
    "/openai": "https://api.openai.com",
    "/claude": "https://api.anthropic.com",
    "/gemini": "https://generativelanguage.googleapis.com",
    "/groq": "https://api.groq.com/openai",
    "/xai": "https://api.x.ai",
    "/cohere": "https://api.cohere.ai",
    "/huggingface": "https://api-inference.huggingface.co",
    "/together": "https://api.together.xyz",
    "/novita": "https://api.novita.ai",
    "/portkey": "https://api.portkey.ai",
    "/fireworks": "https://api.fireworks.ai",
    "/openrouter": "https://openrouter.ai/api",
    "/discord": "https://discord.com/api",
    "/telegram": "https://api.telegram.org",
    "/422wolf": "https://422wolf.198990.xyz",
    "/qwen": "https://qwen.198990.xyz",
    "/newapi": "https://newapi.190904.xyz",
    "/gbalance": "http://jp2.190904.xyz:8010",
    "/gbalance2": "http://usa2.190904.xyz:8000",
    "/gbalance3": "http://usa4.190904.xyz:8010",
    "/gcli": "http://usa4.190904.xyz:7856",
    "/cliproxy": "http://usa4.190904.xyz:8317",
    "/vertex": "https://aiplatform.googleapis.com/v1/projects/1094537026349/locations/global/publishers",
};

export default async (req: Request, ctx: Context) => {
    // OPTIONS 快速返回
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            },
        });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // 快速匹配
    let base: string | null = null;
    let prefix = "";
    for (const p in CONFIG) {
        if (path === p || path.startsWith(p + "/")) {
            base = CONFIG[p];
            prefix = p;
            break;
        }
    }

    if (!base) return; // 未匹配，跳过

    // 构造目标 URL
    let target = base.replace(/\/$/, "") + path.substring(prefix.length);

    // Vertex 特殊处理
    if (prefix === "/vertex") {
        target = target.replace("/publishers/v1beta", "/publishers/google")
            .replace("/publishers/v1", "/publishers/google");
    }

    // 直接透传，不修改任何头
    const res = await fetch(target + url.search, {
        method: req.method,
        headers: req.headers,
        body: req.body,
    });

    // 直接返回，只加 CORS
    return new Response(res.body, {
        status: res.status,
        headers: {
            ...Object.fromEntries(res.headers),
            "Access-Control-Allow-Origin": "*",
        },
    });
};
