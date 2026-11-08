#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地电子书思维导图自动生成工具 (scripts/generate_mindmap.py)
================================================================
功能：
1. 自动扫描或指定解析本地 `books/` 目录下的 EPUB / TXT 电子书（源文件严禁上传 Git）
2. 按章节自动切分文本，提取回目、字数与章节正文
3. 支持接入云端大模型 API（Gemini / DeepSeek / OpenAI 兼容接口）或本地 Ollama，
   自动生成全书总览、分卷脉络及逐章 Markdown 思维导图
4. 自动输出符合前端规范的 `public/data/<book-id>.json` 并更新 `public/data/books.json` 书架索引

用法示例：
  # 仅解析电子书章节结构并生成基础模板（无需 API Key）
  python scripts/generate_mindmap.py --book "books/某本书.epub" --id "my-book"

  # 使用 DeepSeek / OpenAI 兼容接口或 Gemini 自动生成全书导图
  export LLM_API_KEY="sk-xxx"
  export LLM_BASE_URL="https://api.deepseek.com/v1"   # 或 https://generativelanguage.googleapis.com/v1beta/openai
  export LLM_MODEL="deepseek-chat"                    # 或 gemini-2.5-pro
  python scripts/generate_mindmap.py --book "books/某本书.epub" --id "my-book" --use-llm

  # 使用本地 Ollama 模型（完全离线）
  python scripts/generate_mindmap.py --book "books/某本书.epub" --id "my-book" --use-ollama --ollama-model "qwen2.5:14b"
"""

import argparse
import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date


def parse_epub(epub_path: str):
    """使用 Python 标准库解析 EPUB 元数据与章节正文（零第三方依赖）"""
    meta = {
        "title": os.path.splitext(os.path.basename(epub_path))[0],
        "author": "未知作者",
        "publisher": "",
        "description": "",
    }
    chapters = []

    with zipfile.ZipFile(epub_path, "r") as z:
        namelist = z.namelist()
        opf_files = [n for n in namelist if n.endswith(".opf")]
        if opf_files:
            opf_raw = z.read(opf_files[0]).decode("utf-8", errors="ignore")
            m_title = re.search(r"<dc:title[^>]*>(.*?)</dc:title>", opf_raw, re.S)
            m_author = re.search(r"<dc:creator[^>]*>(.*?)</dc:creator>", opf_raw, re.S)
            m_pub = re.search(r"<dc:publisher[^>]*>(.*?)</dc:publisher>", opf_raw, re.S)
            m_desc = re.search(r"<dc:description[^>]*>(.*?)</dc:description>", opf_raw, re.S)
            if m_title:
                meta["title"] = m_title.group(1).strip()
            if m_author:
                meta["author"] = m_author.group(1).strip()
            if m_pub:
                meta["publisher"] = m_pub.group(1).strip()
            if m_desc:
                meta["description"] = re.sub(r"\s+", " ", m_desc.group(1)).strip()[:300]

        html_files = sorted(
            [
                n
                for n in namelist
                if (n.endswith(".html") or n.endswith(".xhtml"))
                and not any(x in n.lower() for x in ["cover", "toc", "nav", "fulu", "qianyan", "xu"])
            ]
        )

        for idx, fname in enumerate(html_files, start=1):
            raw = z.read(fname).decode("utf-8", errors="ignore")
            h1_m = re.search(r"<h[12][^>]*>(.*?)</h[12]>", raw, re.S)
            hdr_m = re.search(r'class=["\']hdr["\'][^>]*>(.*?)</div>', raw, re.S)
            h1 = re.sub(r"<[^>]+>", "", h1_m.group(1)).strip() if h1_m else f"第{idx}章"
            subtitle = (
                re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", hdr_m.group(1))).strip()
                if hdr_m
                else h1
            )

            paras = [
                re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", p)).strip()
                for p in re.findall(r"<p(?:\s+[^>]*)?>(.*?)</p>", raw, re.S)
            ]
            paras = [p for p in paras if len(p) > 15]
            full_text = "\n".join(paras)

            chapters.append(
                {
                    "num": idx,
                    "h1": h1,
                    "title": subtitle,
                    "charCount": len(full_text),
                    "text": full_text,
                }
            )

    return meta, chapters


def call_llm(prompt: str, api_key: str, base_url: str, model: str) -> str:
    """调用 OpenAI 兼容接口或本地 Ollama 生成 Markdown 思维导图"""
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一位精通文学分析与知识图谱构建的专家。"
                    "请将用户提供的书籍章节内容提炼为层次清晰、重点突出的 Markdown 思维导图（使用 #、##、- 列表层级，最多4层，关键人名/概念用 **加粗**）。"
                    "只输出 Markdown 内容，不要包含代码块围栏。"
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()


def update_books_catalog(book_entry: dict, catalog_path: str = "public/data/books.json"):
    """将新生成的书籍注册到前端书架索引 books.json 中"""
    if os.path.exists(catalog_path):
        with open(catalog_path, "r", encoding="utf-8") as f:
            catalog = json.load(f)
    else:
        catalog = {
            "siteTitle": "AI 读书思维导图馆",
            "siteSubtitle": "结构化拆解经典名著 · 全景交互式知识图谱",
            "updatedAt": str(date.today()),
            "books": [],
        }

    catalog["updatedAt"] = str(date.today())
    existing_ids = [b["id"] for b in catalog["books"]]
    if book_entry["id"] in existing_ids:
        idx = existing_ids.index(book_entry["id"])
        catalog["books"][idx] = book_entry
    else:
        catalog["books"].append(book_entry)

    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    print(f"[+] 已更新书架目录: {catalog_path}")


def main():
    parser = argparse.ArgumentParser(description="从本地 books/ 电子书生成交互式思维导图数据")
    parser.add_argument("--book", required=True, help="本地电子书路径，例如 books/xxx.epub")
    parser.add_argument("--id", required=True, help="输出的书籍唯一英文标识，例如 hongloumeng")
    parser.add_argument("--use-llm", action="store_true", help="使用云端大模型 API 生成导图")
    parser.add_argument("--use-ollama", action="store_true", help="使用本地 Ollama 模型生成导图")
    parser.add_argument("--ollama-model", default="qwen2.5:14b", help="Ollama 模型名称")
    args = parser.parse_args()

    meta, raw_chapters = parse_epub(args.book)
    print(f"[*] 解析成功：《{meta['title']}》 作者：{meta['author']} 共 {len(raw_chapters)} 章")

    api_key = os.environ.get("LLM_API_KEY", "ollama")
    base_url = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1")
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    if args.use_ollama:
        base_url = "http://localhost:11434/v1"
        model = args.ollama_model

    chapters_out = []
    for ch in raw_chapters:
        if args.use_llm or args.use_ollama:
            print(f"  -> 正在调用模型 [{model}] 生成 {ch['h1']} 导图...")
            prompt = (
                f"章节标题：{ch['h1']} {ch['title']}\n\n"
                f"章节正文摘录：\n{ch['text'][:8000]}\n\n"
                f"请生成该章的 Markdown 思维导图（# {ch['h1']}：{ch['title']} 为根节点，包含 2-3 个二级核心事件模块，每个模块下 2-3 条关键细节）。"
            )
            md = call_llm(prompt, api_key, base_url, model)
        else:
            md = f"# {ch['h1']}：{ch['title']}\n## 核心情节\n- {ch['text'][:120]}..."

        chapters_out.append(
            {
                "num": ch["num"],
                "h1": ch["h1"],
                "title": ch["title"],
                "partId": "part-1",
                "partTitle": "全书章节",
                "charCount": ch["charCount"],
                "characters": [],
                "summary": ch["text"][:140] + "...",
                "markdown": md,
            }
        )

    out_data = {
        "id": args.id,
        "title": meta["title"],
        "subtitle": f"{meta['title']} · 全书交互式思维导图",
        "author": meta["author"],
        "publisher": meta["publisher"],
        "category": "电子书导读",
        "totalChapters": len(chapters_out),
        "totalWords": sum(c["charCount"] for c in chapters_out),
        "tags": ["AI导读", f"{len(chapters_out)}章"],
        "description": meta["description"] or f"《{meta['title']}》全书交互式思维导图。",
        "specialMaps": [
            {
                "id": "overview",
                "title": "全书总览导图",
                "badge": "核心必读",
                "description": f"《{meta['title']}》全书结构总览。",
                "markdown": f"# 《{meta['title']}》全书总览\n## 基本信息\n- **作者**：{meta['author']}\n- **章节数**：共 {len(chapters_out)} 章",
            }
        ],
        "parts": [
            {
                "id": "part-1",
                "title": f"全书脉络（第1–{len(chapters_out)}章）",
                "subtitle": meta["title"],
                "range": [1, len(chapters_out)],
                "summary": meta["description"],
                "markdown": f"# 《{meta['title']}》章节脉络\n"
                + "\n".join(f"## {c['h1']}：{c['title']}" for c in chapters_out[:30]),
            }
        ],
        "chapters": chapters_out,
    }

    os.makedirs("public/data", exist_ok=True)
    out_file = f"public/data/{args.id}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=2)
    print(f"[+] 已生成书籍导图数据文件: {out_file}")

    update_books_catalog(
        {
            "id": args.id,
            "title": meta["title"],
            "subtitle": out_data["subtitle"],
            "author": meta["author"],
            "category": "电子书导读",
            "totalChapters": len(chapters_out),
            "totalWords": out_data["totalWords"],
            "tags": out_data["tags"],
            "coverColor": "#2b4c7e",
            "accentColor": "#d4a359",
            "description": out_data["description"],
            "dataUrl": f"data/{args.id}.json",
        }
    )


if __name__ == "__main__":
    main()
