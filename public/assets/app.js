(function () {
  "use strict";

  const state = {
    booksIndex: null,
    currentBook: null,
    currentType: "special", // 'special' | 'part' | 'chapter'
    currentId: "overview",
    currentMarkdown: "",
    currentTitleText: "",
    searchQuery: "",
    selectedCharacter: "",
    markmapInstance: null,
    transformer: null,
    currentRoot: null,
  };

  const DEFAULT_CHARACTERS = [
    "全部",
    "西门庆",
    "潘金莲",
    "李瓶儿",
    "春梅",
    "吴月娘",
    "孟玉楼",
    "陈敬济",
    "应伯爵",
    "武松",
    "王六儿",
    "孙雪娥",
    "宋蕙莲",
    "玳安",
  ];

  // DOM Elements
  const els = {
    bookSelector: document.getElementById("bookSelector"),
    bookTitle: document.getElementById("bookTitle"),
    bookAuthor: document.getElementById("bookAuthor"),
    bookDesc: document.getElementById("bookDesc"),
    bookStats: document.getElementById("bookStats"),
    specialNavList: document.getElementById("specialNavList"),
    partsNavList: document.getElementById("partsNavList"),
    chaptersNavList: document.getElementById("chaptersNavList"),
    chapterCountBadge: document.getElementById("chapterCountBadge"),
    chapterSearch: document.getElementById("chapterSearch"),
    clearSearchBtn: document.getElementById("clearSearchBtn"),
    charFilterBar: document.getElementById("charFilterBar"),
    currentBadge: document.getElementById("currentBadge"),
    currentTitle: document.getElementById("currentTitle"),
    prevItemBtn: document.getElementById("prevItemBtn"),
    nextItemBtn: document.getElementById("nextItemBtn"),
    markmapSvg: document.getElementById("markmapSvg"),
    mindmapWrapper: document.getElementById("mindmapWrapper"),
    currentSummaryBox: document.getElementById("currentSummaryBox"),
    currentCharactersBox: document.getElementById("currentCharactersBox"),
    markdownPreview: document.getElementById("markdownPreview"),
    sidebar: document.getElementById("sidebar"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    outlineDrawer: document.getElementById("outlineDrawer"),
    outlineToggleBtn: document.getElementById("outlineToggleBtn"),
    closeDrawerBtn: document.getElementById("closeDrawerBtn"),
    quickTabs: document.getElementById("quickTabs"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    fitViewBtn: document.getElementById("fitViewBtn"),
    expandAllBtn: document.getElementById("expandAllBtn"),
    collapseLevelBtn: document.getElementById("collapseLevelBtn"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    exportMdBtn: document.getElementById("exportMdBtn"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    backdrop: document.getElementById("backdrop"),
  };

  // ===== Mobile helpers =====
  const mobileMq = window.matchMedia("(max-width: 768px)");
  const isMobile = () => mobileMq.matches;

  function refitLater() {
    setTimeout(() => state.markmapInstance && state.markmapInstance.fit(), 280);
  }

  function syncPanelsUi() {
    const sidebarOpen = !els.sidebar.classList.contains("collapsed");
    const drawerOpen = !els.outlineDrawer.classList.contains("collapsed");
    els.outlineToggleBtn.classList.toggle("active", drawerOpen);
    els.backdrop.classList.toggle("show", isMobile() && (sidebarOpen || drawerOpen));
  }

  function setSidebar(open) {
    els.sidebar.classList.toggle("collapsed", !open);
    if (open && isMobile()) els.outlineDrawer.classList.add("collapsed");
    syncPanelsUi();
    refitLater();
  }

  function setDrawer(open) {
    els.outlineDrawer.classList.toggle("collapsed", !open);
    if (open && isMobile()) els.sidebar.classList.add("collapsed");
    syncPanelsUi();
    refitLater();
  }

  function applyResponsiveLayout() {
    if (isMobile()) {
      els.sidebar.classList.add("collapsed");
      els.outlineDrawer.classList.add("collapsed");
    } else {
      els.sidebar.classList.remove("collapsed");
      els.outlineDrawer.classList.toggle("collapsed", window.innerWidth <= 1100);
    }
    syncPanelsUi();
  }

  // Initialize Markmap Transformer
  function initMarkmapEngine() {
    if (window.markmap && window.markmap.Transformer) {
      state.transformer = new window.markmap.Transformer();
    }
  }

  // Simple Markdown to HTML for the right-side reading drawer
  function renderMarkdownToHtml(md) {
    if (!md) return "";
    const lines = md.split("\n");
    let html = "";
    let inList = false;

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\$\\rightarrow\$/g, " → ");

      if (formatted.startsWith("# ")) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h1>${formatted.slice(2)}</h1>`;
      } else if (formatted.startsWith("## ")) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h2>${formatted.slice(3)}</h2>`;
      } else if (formatted.startsWith("### ")) {
        if (inList) { html += "</ul>"; inList = false; }
        html += `<h3>${formatted.slice(4)}</h3>`;
      } else if (formatted.startsWith("- ")) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += `<li>${formatted.slice(2)}</li>`;
      }
    }
    if (inList) html += "</ul>";
    return html;
  }

  // Render Markdown into Interactive Markmap SVG
  function renderMindmap(md, collapseDepth = 0, forceExpandAll = false) {
    if (!state.transformer || !window.markmap) {
      els.currentTitle.textContent = "正在等待导图组件加载...";
      return;
    }

    const cleanMd = md.replace(/\$\\rightarrow\$/g, "→");
    const { root } = state.transformer.transform(cleanMd);

    if (collapseDepth > 0) {
      setCollapseDepth(root, 1, collapseDepth);
    } else if (!forceExpandAll && root.children && root.children.length > 5) {
      // 针对二级分支较多的长章节（如《明朝那些事儿》），桌面端默认展开前3个分支详情，其余折叠以保证字号清晰可读
      root.children.forEach((child, idx) => {
        if (idx >= 3 && child.payload) {
          child.payload.fold = 1;
        }
      });
    }

    state.currentRoot = root;

    if (!state.markmapInstance) {
      const { Markmap } = window.markmap;
      state.markmapInstance = Markmap.create(
        els.markmapSvg,
        {
          autoFit: true,
          fitRatio: isMobile() ? 0.88 : 0.94,
          duration: 260,
          maxWidth: isMobile() ? 210 : 360,
          paddingX: isMobile() ? 8 : 16,
          spacingVertical: isMobile() ? 5 : 8,
          spacingHorizontal: isMobile() ? 32 : 68,
        },
        root
      );
    } else {
      state.markmapInstance.setData(root);
      state.markmapInstance.fit();
    }
  }

  function setCollapseDepth(node, currentDepth, maxDepth) {
    if (!node) return;
    if (node.payload) {
      node.payload.fold = currentDepth >= maxDepth ? 1 : 0;
    }
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        setCollapseDepth(child, currentDepth + 1, maxDepth);
      }
    }
  }

  // Load Books Catalog
  async function loadCatalog() {
    initMarkmapEngine();
    try {
      const res = await fetch("data/books.json");
      state.booksIndex = await res.json();

      els.bookSelector.innerHTML = state.booksIndex.books
        .map((b) => {
          const unit = b.unitLabel || "章";
          return `<option value="${b.id}">${b.title} (${b.totalChapters}${unit})</option>`;
        })
        .join("");

      // Check if URL hash specifies a bookId (#bookId/type/id or #type/id)
      const hashParts = window.location.hash.slice(1).split("/");
      let initialBook = state.booksIndex.books[0];
      if (hashParts.length === 3) {
        const matched = state.booksIndex.books.find((b) => b.id === hashParts[0]);
        if (matched) {
          initialBook = matched;
          els.bookSelector.value = matched.id;
        }
      }

      if (initialBook) {
        await loadBook(initialBook.dataUrl, true);
      }
    } catch (err) {
      console.error("Failed to load books catalog:", err);
      els.currentTitle.textContent = "加载图书目录失败，请通过 HTTP 服务访问";
    }
  }

  // Load Single Book Dataset
  async function loadBook(dataUrl, checkHash = false) {
    try {
      const res = await fetch(dataUrl);
      const book = await res.json();
      state.currentBook = book;
      state.selectedCharacter = "";
      state.searchQuery = "";
      els.chapterSearch.value = "";
      els.clearSearchBtn.classList.add("hidden");

      const unit = book.unitLabel || "章";

      // Update search placeholder dynamically
      const sampleChars = (book.topCharacters || DEFAULT_CHARACTERS).slice(1, 4).join(" / ");
      els.chapterSearch.placeholder = `搜索章节、人物、事件 (如: ${sampleChars})...`;

      // Update topbar quick tabs dynamically for current book
      const s0 = book.specialMaps[0] || { id: "overview", title: "全书总览" };
      const s1 = book.specialMaps[1] || { id: "characters", title: "人物图谱" };
      const s2 = book.specialMaps[2] || { id: "themes", title: "深度专题" };
      const partLabel = book.partUnitLabel || `分卷脉络 (${book.parts.length}卷)`;
      const chapLabel = `逐${unit}精析 (${book.totalChapters}${unit})`;

      els.quickTabs.innerHTML = `
        <button class="tab-btn" data-type="special" data-id="${s0.id}">${s0.title}</button>
        <button class="tab-btn" data-type="special" data-id="${s1.id}">${s1.title}</button>
        <button class="tab-btn" data-type="special" data-id="${s2.id}">${s2.title}</button>
        <button class="tab-btn" data-type="part" data-id="part-1">${partLabel}</button>
        <button class="tab-btn" data-type="chapter" data-id="1">${chapLabel}</button>
      `;
      els.quickTabs.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectMapItem(btn.dataset.type, btn.dataset.id);
        });
      });

      // Render Book Meta Card
      els.bookTitle.textContent = book.title;
      els.bookAuthor.textContent = book.author;
      els.bookDesc.textContent = book.description;
      els.bookStats.innerHTML = [
        `<span class="stat-chip">共 ${book.totalChapters} ${unit}</span>`,
        `<span class="stat-chip">约 ${(book.totalWords / 10000).toFixed(1)} 万字</span>`,
        ...book.tags.map((t) => `<span class="stat-chip">${t}</span>`),
      ].join("");

      renderCharacterFilters();
      renderNavigationLists();

      if (!checkHash || !applyUrlHash()) {
        selectMapItem("special", "overview");
      }
    } catch (err) {
      console.error("Failed to load book JSON:", err);
    }
  }

  // Character filter tags
  function renderCharacterFilters() {
    const chars =
      (state.currentBook && state.currentBook.topCharacters) || DEFAULT_CHARACTERS;
    els.charFilterBar.innerHTML = chars
      .map((ch) => {
        const val = ch === "全部" ? "" : ch;
        const isActive = state.selectedCharacter === val ? "active" : "";
        return `<button class="char-tag ${isActive}" data-char="${val}">${ch}</button>`;
      })
      .join("");

    els.charFilterBar.querySelectorAll(".char-tag").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedCharacter = btn.dataset.char;
        renderCharacterFilters();
        renderChaptersList();
      });
    });
  }

  // Render All Sidebar Lists
  function renderNavigationLists() {
    const book = state.currentBook;
    if (!book) return;
    const unit = book.unitLabel || "章";

    // 1. Special Maps
    els.specialNavList.innerHTML = book.specialMaps
      .map(
        (m) => `
      <button class="nav-item" data-type="special" data-id="${m.id}">
        <div class="nav-item-top">
          <span class="nav-item-num">${m.badge}</span>
          <span class="nav-item-title">${m.title}</span>
        </div>
        <div class="nav-item-sub">${m.description}</div>
      </button>
    `
      )
      .join("");

    // 2. Parts / Volumes
    const partsTitleEl = document.getElementById("partsSectionTitle");
    const chaptersTitleEl = document.getElementById("chaptersSectionTitle");
    if (partsTitleEl) partsTitleEl.textContent = `分卷脉络导图（${book.parts.length} 卷）`;
    if (chaptersTitleEl) chaptersTitleEl.textContent = `逐${unit}精细导图`;

    els.partsNavList.innerHTML = book.parts
      .map(
        (p, idx) => `
      <button class="nav-item" data-type="part" data-id="${p.id}">
        <div class="nav-item-top">
          <span class="nav-item-num">${p.range[0]}–${p.range[1]}${unit}</span>
          <span class="nav-item-title">${p.title}</span>
        </div>
        <div class="nav-item-sub">${p.subtitle}</div>
      </button>
    `
      )
      .join("");

    // 3. Chapters
    renderChaptersList();

    // Attach click handlers for special & parts
    els.specialNavList.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => selectMapItem("special", item.dataset.id));
    });
    els.partsNavList.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => selectMapItem("part", item.dataset.id));
    });
  }

  function renderChaptersList() {
    const book = state.currentBook;
    if (!book) return;
    const unit = book.unitLabel || "章";

    const q = state.searchQuery.trim().toLowerCase();
    const charFilter = state.selectedCharacter;

    const filtered = book.chapters.filter((ch) => {
      if (charFilter && !ch.characters.some((c) => c.includes(charFilter))) {
        return false;
      }
      if (!q) return true;
      return (
        ch.h1.toLowerCase().includes(q) ||
        ch.title.toLowerCase().includes(q) ||
        ch.summary.toLowerCase().includes(q) ||
        ch.characters.some((c) => c.toLowerCase().includes(q)) ||
        String(ch.num) === q
      );
    });

    els.chapterCountBadge.textContent = `${filtered.length} / ${book.chapters.length}${unit}`;

    els.chaptersNavList.innerHTML = filtered
      .map(
        (ch) => `
      <button class="nav-item ${
        state.currentType === "chapter" && String(state.currentId) === String(ch.num)
          ? "active"
          : ""
      }" data-type="chapter" data-id="${ch.num}">
        <div class="nav-item-top">
          <span class="nav-item-num">${ch.h1}</span>
          <span class="nav-item-title">${ch.title}</span>
        </div>
        <div class="nav-item-sub">${ch.summary}</div>
      </button>
    `
      )
      .join("");

    els.chaptersNavList.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => selectMapItem("chapter", item.dataset.id));
    });
  }

  // Select and Display a Mindmap
  function selectMapItem(type, id) {
    const book = state.currentBook;
    if (!book) return;
    const unit = book.unitLabel || "章";

    state.currentType = type;
    state.currentId = String(id);

    let badge = "";
    let title = "";
    let summary = "";
    let chars = [];
    let md = "";
    let defaultCollapse = 0;
    const mobile = isMobile();

    if (type === "special") {
      const m = book.specialMaps.find((x) => x.id === id) || book.specialMaps[0];
      badge = m.badge;
      title = `${book.title} · ${m.title}`;
      summary = m.description;
      md = m.markdown;
      // 专题导图节点多，默认只展开前两层，点击节点可继续展开
      defaultCollapse = mobile ? 2 : 3;
    } else if (type === "part") {
      const p = book.parts.find((x) => x.id === id) || book.parts[0];
      badge = `分卷导图 (${p.range[0]}-${p.range[1]}${unit})`;
      title = p.title;
      summary = p.summary;
      md = p.markdown;
      defaultCollapse = mobile ? 2 : 3;
    } else if (type === "chapter") {
      const num = parseInt(id, 10);
      const ch = book.chapters.find((x) => x.num === num) || book.chapters[0];
      badge = ch.h1;
      title = `${ch.h1}：${ch.title}`;
      summary = ch.summary;
      chars = ch.characters || [];
      md = ch.markdown;
      defaultCollapse = mobile ? 2 : 0;
    }
    state.defaultCollapse = defaultCollapse;

    state.currentMarkdown = md;
    state.currentTitleText = title;

    // Update Header & Outline Drawer
    els.currentBadge.textContent = badge;
    els.currentTitle.textContent = title;
    els.currentSummaryBox.innerHTML = `<strong>核心导读：</strong>${summary}`;

    if (chars.length > 0) {
      els.currentCharactersBox.innerHTML = chars
        .map(
          (c) =>
            `<span class="char-pill" data-char="${c}" title="点击筛选该人物相关章节">👤 ${c}</span>`
        )
        .join("");
      els.currentCharactersBox.querySelectorAll(".char-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
          state.selectedCharacter = pill.dataset.char;
          renderCharacterFilters();
          renderChaptersList();
          if (isMobile()) setSidebar(true);
        });
      });
    } else {
      els.currentCharactersBox.innerHTML = "";
    }

    els.markdownPreview.innerHTML = renderMarkdownToHtml(md);

    // Highlight active nav item
    document.querySelectorAll(".nav-item").forEach((el) => {
      const isMatch =
        el.dataset.type === state.currentType && String(el.dataset.id) === state.currentId;
      el.classList.toggle("active", isMatch);
      if (isMatch) {
        el.scrollIntoView({ block: "nearest" });
      }
    });

    // Highlight topbar quick tabs
    els.quickTabs.querySelectorAll(".tab-btn").forEach((btn) => {
      if (state.currentType === "special") {
        btn.classList.toggle(
          "active",
          btn.dataset.type === "special" && btn.dataset.id === state.currentId
        );
      } else if (state.currentType === "part") {
        btn.classList.toggle("active", btn.dataset.type === "part");
      } else if (state.currentType === "chapter") {
        btn.classList.toggle("active", btn.dataset.type === "chapter");
      }
    });

    updateStepButtons();
    renderMindmap(md, defaultCollapse);

    // 移动端选中后自动收起目录抽屉
    if (isMobile() && !els.sidebar.classList.contains("collapsed")) {
      setSidebar(false);
    }

    // Update URL Hash with bookId
    state.lastHash = `#${book.id}/${type}/${id}`;
    history.replaceState(null, "", state.lastHash);
  }

  // Prev / Next sequential navigation
  function getOrderedSequence() {
    const book = state.currentBook;
    if (!book) return [];
    const seq = [];
    book.specialMaps.forEach((m) => seq.push({ type: "special", id: m.id }));
    book.parts.forEach((p) => seq.push({ type: "part", id: p.id }));
    book.chapters.forEach((c) => seq.push({ type: "chapter", id: String(c.num) }));
    return seq;
  }

  function updateStepButtons() {
    const seq = getOrderedSequence();
    const idx = seq.findIndex(
      (x) => x.type === state.currentType && String(x.id) === state.currentId
    );
    els.prevItemBtn.disabled = idx <= 0;
    els.nextItemBtn.disabled = idx === -1 || idx >= seq.length - 1;
  }

  function stepNavigate(delta) {
    const seq = getOrderedSequence();
    const idx = seq.findIndex(
      (x) => x.type === state.currentType && String(x.id) === state.currentId
    );
    const target = seq[idx + delta];
    if (target) {
      selectMapItem(target.type, target.id);
    }
  }

  function applyUrlHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return false;
    const parts = hash.split("/");
    if (parts.length === 3) {
      selectMapItem(parts[1], parts[2]);
      return true;
    } else if (parts.length === 2) {
      selectMapItem(parts[0], parts[1]);
      return true;
    }
    return false;
  }

  // Bind UI Events
  function bindEvents() {
    // Book Selector Switcher!
    els.bookSelector.addEventListener("change", async (e) => {
      const selectedId = e.target.value;
      const entry =
        state.booksIndex &&
        state.booksIndex.books.find((b) => b.id === selectedId);
      if (entry) {
        await loadBook(entry.dataUrl, false);
      }
    });

    // Search input
    els.chapterSearch.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      els.clearSearchBtn.classList.toggle("hidden", !state.searchQuery);
      renderChaptersList();
    });

    els.clearSearchBtn.addEventListener("click", () => {
      els.chapterSearch.value = "";
      state.searchQuery = "";
      els.clearSearchBtn.classList.add("hidden");
      renderChaptersList();
    });

    // Prev / Next buttons
    els.prevItemBtn.addEventListener("click", () => stepNavigate(-1));
    els.nextItemBtn.addEventListener("click", () => stepNavigate(1));

    // Sidebar & Outline Drawer Toggles
    els.sidebarToggle.addEventListener("click", () => {
      setSidebar(els.sidebar.classList.contains("collapsed"));
    });

    els.outlineToggleBtn.addEventListener("click", () => {
      setDrawer(els.outlineDrawer.classList.contains("collapsed"));
    });

    els.closeDrawerBtn.addEventListener("click", () => setDrawer(false));

    els.backdrop.addEventListener("click", () => {
      els.sidebar.classList.add("collapsed");
      els.outlineDrawer.classList.add("collapsed");
      syncPanelsUi();
    });

    mobileMq.addEventListener("change", () => {
      applyResponsiveLayout();
      refitLater();
    });

    // Canvas Controls
    els.zoomInBtn.addEventListener("click", () => {
      if (state.markmapInstance) state.markmapInstance.rescale(1.25);
    });
    els.zoomOutBtn.addEventListener("click", () => {
      if (state.markmapInstance) state.markmapInstance.rescale(0.8);
    });
    els.fitViewBtn.addEventListener("click", () => {
      if (state.markmapInstance) state.markmapInstance.fit();
    });
    els.expandAllBtn.addEventListener("click", () => {
      renderMindmap(state.currentMarkdown, 0, true);
    });
    els.collapseLevelBtn.addEventListener("click", () => {
      renderMindmap(state.currentMarkdown, 2);
    });
    els.fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        els.mindmapWrapper.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Export Markdown
    els.exportMdBtn.addEventListener("click", () => {
      if (!state.currentMarkdown) return;
      const blob = new Blob([state.currentMarkdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.currentTitleText.replace(/[\\/:*?"<>|]/g, "_")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Theme Switcher (persisted)
    const applyThemeColor = () => {
      const meta = document.querySelector('meta[name="theme-color"]');
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (meta) meta.setAttribute("content", dark ? "#161922" : "#efeadd");
    };
    applyThemeColor();
    els.themeToggleBtn.addEventListener("click", () => {
      const html = document.documentElement;
      const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
      html.setAttribute("data-theme", next);
      try {
        localStorage.setItem("mindmap-theme", next);
      } catch (e) {}
      applyThemeColor();
    });

    // 支持手动修改地址栏锚点 / 分享链接跳转
    window.addEventListener("hashchange", async () => {
      if (window.location.hash === state.lastHash || !state.booksIndex) return;
      const parts = window.location.hash.slice(1).split("/");
      if (parts.length === 3 && state.currentBook && parts[0] !== state.currentBook.id) {
        const entry = state.booksIndex.books.find((b) => b.id === parts[0]);
        if (entry) {
          els.bookSelector.value = entry.id;
          await loadBook(entry.dataUrl, true);
          return;
        }
      }
      applyUrlHash();
    });

    // Keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") {
        stepNavigate(-1);
      } else if (e.key === "ArrowRight") {
        stepNavigate(1);
      } else if (e.key.toLowerCase() === "b") {
        els.sidebarToggle.click();
      } else if (e.key.toLowerCase() === "f") {
        if (state.markmapInstance) state.markmapInstance.fit();
      }
    });

    window.addEventListener("resize", () => {
      if (state.markmapInstance) state.markmapInstance.fit();
    });
  }

  // Boot Application
  applyResponsiveLayout();
  bindEvents();
  loadCatalog();
})();
