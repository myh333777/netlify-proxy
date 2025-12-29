// netlify/edge-functions/api-proxy.ts
// 专用 AI API 代理 - 极限优化版
// 特点：无内容重写、纯流式透传、边缘缓存支持

import type { Context } from "@netlify/edge-functions";

// AI API 代理配置（只处理纯 API 转发）
const API_PROXY_CONFIG: Record<string, string> = {
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
    // 自定义服务
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

// 需要特殊路径处理的服务
const VERTEX_PREFIX = "/vertex";

export default async (request: Request, context: Context) => {
    // 快速处理 CORS 预检
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",
            },
        });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 快速匹配代理配置
    let targetBaseUrl: string | null = null;
    let matchedPrefix: string | null = null;

    for (const prefix of Object.keys(API_PROXY_CONFIG)) {
        if (path === prefix || path.startsWith(prefix + "/")) {
            targetBaseUrl = API_PROXY_CONFIG[prefix];
            matchedPrefix = prefix;
            break;
        }
    }

    // 未匹配则跳过，交给其他处理器
    if (!targetBaseUrl || !matchedPrefix) {
        return;
    }

    try {
        // 构造目标 URL
        const remainingPath = path.substring(matchedPrefix.length);
        let targetUrlString = targetBaseUrl.replace(/\/$/, "") + remainingPath;

        // Vertex AI 特殊处理
        if (matchedPrefix === VERTEX_PREFIX) {
            if (remainingPath.startsWith("/v1beta") || remainingPath.startsWith("/v1")) {
                targetUrlString = targetUrlString
                    .replace("/publishers/v1beta", "/publishers/google")
                    .replace("/publishers/v1", "/publishers/google");
            }
        }

        const targetUrl = new URL(targetUrlString);
        targetUrl.search = url.search;

        // 精简请求头（只保留必要的）
        const proxyHeaders = new Headers();
        const essentialHeaders = [
            "authorization",
            "content-type",
            "accept",
            "x-api-key",
            "anthropic-version",
            "x-goog-api-key",
        ];

        for (const header of essentialHeaders) {
            const value = request.headers.get(header);
            if (value) {
                proxyHeaders.set(header, value);
            }
        }
        proxyHeaders.set("Host", targetUrl.host);

        // 发起代理请求
        const response = await fetch(targetUrl.toString(), {
            method: request.method,
            headers: proxyHeaders,
            body: request.body,
        });

        // 构建响应头
        const responseHeaders = new Headers();

        // 透传重要的响应头
        const passHeaders = [
            "content-type",
            "x-request-id",
            "x-ratelimit-limit",
            "x-ratelimit-remaining",
            "x-ratelimit-reset",
        ];

        for (const header of passHeaders) {
            const value = response.headers.get(header);
            if (value) {
                responseHeaders.set(header, value);
            }
        }

        // CORS
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
        responseHeaders.set("Access-Control-Allow-Headers", "*");

        // 边缘缓存（GET 请求可缓存）
        if (request.method === "GET") {
            responseHeaders.set("Netlify-CDN-Cache-Control", "public, max-age=60, stale-while-revalidate=30");
            responseHeaders.set("Netlify-Cache-Id", `api${matchedPrefix}`);
        }

        // 直接流式透传响应体，不缓冲
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        context.log("API Proxy Error:", error);
        return new Response(JSON.stringify({ error: "Proxy Error", message: String(error) }), {
            status: 502,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    }
};
