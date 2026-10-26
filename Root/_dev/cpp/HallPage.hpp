// ============================================================================
//  游戏大厅 · 页面模板
//  ---------------------------------------------------------------------------
//  由 GameHall.cpp 把 __HALL_DATA__ 替换成清单 JSON 后, 写成 Z:\Root\_runtime\hall.html,
//  由**同一个** WebView2 渲染(不产出可双击的静态大厅页 —— 大厅只保留 WebView2 版)。
//  页面住在 _runtime\ 里, 所以本地依赖用 ../game/... 这种上跳一级的相对路径。
//
//  为什么单独放一个头文件: 页面有 600 多行 CSS/JS, 塞进 GameHall.cpp 会把宿主
//  逻辑淹没; 这里只放一个字符串常量, 宿主只负责注入数据与消息桥。
//
//  设计要点(参考 Steam / Playnite / GOG Galaxy 这类启动器的成熟做法):
//    * 左侧栏: 分组 / 收藏 / 最近游玩, 带数量角标 —— 库再大也不用翻卡片找;
//    * 顶栏: 搜索(名称+标签+说明+子页面) + 排序(默认/名称/最近);
//    * 卡片网格: 纯 CSS 生成封面(无图片依赖, 断网也好看), 悬停抬升 + 焦点环;
//    * 「破门而入」四个页面合成一张主打卡片, 子页面作为模式按钮直接进入;
//    * 收藏 / 最近游玩 / 视图 / 排序 存 localStorage, 下次打开保持原样;
//    * 空状态、缺失文件提示、Toast 反馈、键盘导航(方向键/Enter/F//) 齐全;
//    * 零网络依赖: 图标用随包的本地 FontAwesome, 无任何 CDN / webfont 外链。
// ============================================================================
#pragma once

static const wchar_t* kHallPageTemplate = LR"HALLPAGE(<!DOCTYPE html>
<html lang="zh-CN" data-hall-page="1">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>游戏大厅</title>
<link rel="stylesheet" href="../game/lib/fontawesome-free-7.3.1-web/css/all.min.css">
<style>
:root{
  --bg:#060910;--bg2:#0a0f1b;--panel:#0e1626;--panel2:#121c30;
  --line:rgba(122,162,255,.13);--line2:rgba(122,162,255,.30);
  --txt:#e9eefb;--dim:#8d9cbb;--dim2:#61708f;
  --ac:#4f8cff;--ac2:#2f6fe0;--ok:#3ddc84;--warn:#ffb454;--bad:#ff7070;
  --r:14px;--shadow:0 14px 34px rgba(0,0,0,.5);
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{
  background:
    radial-gradient(1100px 480px at 78% -12%,rgba(79,140,255,.16),transparent 62%),
    radial-gradient(760px 420px at -6% 108%,rgba(61,220,132,.07),transparent 58%),
    linear-gradient(180deg,var(--bg),var(--bg2));
  color:var(--txt);font:14px/1.6 "Microsoft YaHei","PingFang SC",system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-user-select:none;user-select:none;overflow:hidden;
}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:rgba(122,162,255,.20);border-radius:8px;border:2px solid transparent;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:rgba(122,162,255,.36);background-clip:content-box}
::-webkit-scrollbar-track{background:transparent}
.app{display:flex;height:100vh;overflow:hidden}

/* ---------------- 侧栏 ---------------- */
.side{flex:0 0 246px;width:246px;display:flex;flex-direction:column;gap:14px;padding:18px 14px 14px;
  background:linear-gradient(180deg,rgba(14,22,38,.92),rgba(8,13,24,.92));
  border-right:1px solid var(--line);overflow:auto}
.brand{display:flex;align-items:center;gap:11px;padding:2px 6px 12px;border-bottom:1px solid var(--line)}
.brand .logo{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:12px;
  background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff;font-size:18px;
  box-shadow:0 8px 20px rgba(47,111,224,.42)}
.brand h1{margin:0;font-size:17px;letter-spacing:2px}
.brand p{margin:2px 0 0;font-size:10.5px;color:var(--dim2);letter-spacing:.6px}
.nav{display:flex;flex-direction:column;gap:3px}
.nav .sec{padding:10px 10px 5px;font-size:10.5px;color:var(--dim2);letter-spacing:2px}
.nav button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 11px;border:1px solid transparent;
  border-radius:10px;background:transparent;color:var(--dim);font:inherit;font-size:13px;text-align:left;
  cursor:pointer;transition:background .13s,color .13s,border-color .13s}
.nav button i:first-child{width:16px;text-align:center;font-size:13px;opacity:.9}
.nav button .c{margin-left:auto;font-size:10.5px;color:var(--dim2);background:rgba(122,162,255,.08);
  border:1px solid var(--line);border-radius:999px;padding:1px 8px;min-width:24px;text-align:center}
.nav button:hover{background:rgba(122,162,255,.09);color:var(--txt)}
.nav button.on{background:linear-gradient(90deg,rgba(79,140,255,.24),rgba(79,140,255,.06));
  border-color:var(--line2);color:#fff;box-shadow:inset 3px 0 0 var(--ac)}
.nav button.on .c{color:var(--txt);border-color:var(--line2)}
.sideFoot{margin-top:auto;display:flex;flex-direction:column;gap:7px;padding-top:14px;border-top:1px solid var(--line)}
.sbtn{display:flex;align-items:center;gap:9px;width:100%;padding:8px 11px;border:1px solid var(--line);
  border-radius:9px;background:rgba(122,162,255,.06);color:var(--dim);font:inherit;font-size:12.5px;cursor:pointer;
  transition:background .13s,color .13s}
.sbtn:hover{background:rgba(122,162,255,.16);color:var(--txt)}
.hostTag{font-size:10.5px;color:var(--dim2);line-height:1.7;padding:2px 4px}
.hostTag b{color:var(--ok)}

/* ---------------- 主区 ---------------- */
.main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.top{display:flex;align-items:center;gap:12px;padding:16px 22px 10px;flex-wrap:wrap}
.search{position:relative;flex:1;min-width:220px;max-width:520px}
.search i{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--dim2);font-size:13px;pointer-events:none}
.search input{width:100%;padding:10px 34px 10px 36px;border:1px solid var(--line);border-radius:11px;
  background:rgba(10,16,30,.85);color:var(--txt);font:inherit;font-size:13px;outline:none;
  transition:border-color .15s,box-shadow .15s}
.search input::placeholder{color:var(--dim2)}
.search input:focus{border-color:var(--line2);box-shadow:0 0 0 3px rgba(79,140,255,.16)}
.search .clr{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;
  color:var(--dim2);cursor:pointer;padding:4px 7px;border-radius:7px;display:none}
.search .clr:hover{color:var(--txt);background:rgba(122,162,255,.12)}
.seg{display:flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:11px;background:rgba(10,16,30,.7)}
.seg button{border:0;background:transparent;color:var(--dim);font:inherit;font-size:12px;padding:6px 13px;
  border-radius:8px;cursor:pointer;transition:background .13s,color .13s}
.seg button:hover{color:var(--txt)}
.seg button.on{background:rgba(79,140,255,.24);color:#fff}
.crumbRow{display:flex;align-items:center;gap:10px;padding:2px 22px 10px;font-size:12px;color:var(--dim2)}
.crumbRow b{color:var(--txt);font-weight:600;font-size:13px}
.crumbRow .sep{opacity:.4}
.scroll{flex:1;overflow:auto;padding:0 22px 26px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;align-content:start}

/* ---------------- 卡片 ---------------- */
.card{position:relative;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--r);
  background:linear-gradient(165deg,var(--panel),var(--panel2));box-shadow:var(--shadow);overflow:hidden;
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;outline:none}
.card:hover{transform:translateY(-3px);border-color:var(--line2);box-shadow:0 18px 40px rgba(0,0,0,.58)}
.card:focus-visible{border-color:var(--ac);box-shadow:0 0 0 3px rgba(79,140,255,.32),var(--shadow)}
.card.hero{grid-column:span 2}
.cover{position:relative;height:116px;overflow:hidden;
  background:
    radial-gradient(130% 150% at 104% -20%,var(--acs),transparent 62%),
    linear-gradient(140deg,#152036,#0a1120 72%)}
.card.hero .cover{height:142px}
.cover::before{content:"";position:absolute;inset:0;
  background:
    repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 26px),
    repeating-linear-gradient(0deg,rgba(255,255,255,.028) 0 1px,transparent 1px 26px);
  -webkit-mask-image:linear-gradient(180deg,rgba(0,0,0,.85),transparent 92%);
  mask-image:linear-gradient(180deg,rgba(0,0,0,.85),transparent 92%)}
.cover .glyph{position:absolute;right:16px;bottom:-14px;font-size:84px;line-height:1;
  color:var(--ac);opacity:.5;filter:drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.card.hero .cover .glyph{font-size:106px;right:26px;bottom:-18px}
.cover .kind{position:absolute;left:12px;top:12px;font-size:10.5px;letter-spacing:1px;padding:3px 9px;
  border-radius:999px;border:1px solid var(--line2);background:rgba(6,10,18,.72);color:var(--dim)}
.cover .star{position:absolute;right:10px;top:9px;width:30px;height:30px;border-radius:9px;border:1px solid var(--line);
  background:rgba(6,10,18,.66);color:var(--dim2);cursor:pointer;font-size:12.5px;transition:color .14s,background .14s,transform .14s}
.cover .star:hover{color:var(--warn);background:rgba(6,10,18,.9);transform:scale(1.06)}
.cover .star.on{color:var(--warn);border-color:rgba(255,180,84,.5)}
.cover .ribbon{position:absolute;left:0;top:44px;font-size:10px;letter-spacing:2px;padding:3px 11px 3px 9px;
  background:linear-gradient(90deg,var(--ac),transparent);color:#08101f;font-weight:700;border-radius:0 999px 999px 0}
.body{display:flex;flex-direction:column;gap:9px;padding:13px 15px 15px;flex:1}
.titleRow{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.titleRow h2{margin:0;font-size:15.5px;letter-spacing:.4px}
.titleRow .n{font-size:10.5px;color:var(--dim2);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.titleRow .ago{margin-left:auto;font-size:10.5px;color:var(--dim2)}
.desc{margin:0;font-size:12px;line-height:1.78;color:#b6c3dd;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card.hero .desc{-webkit-line-clamp:4}
.tags{display:flex;gap:6px;flex-wrap:wrap}
.tags span{font-size:10.5px;color:var(--dim);border:1px solid var(--line);border-radius:7px;padding:1.5px 8px;
  background:rgba(122,162,255,.05)}
.modes{display:flex;gap:6px;flex-wrap:wrap;padding-top:2px}
.modes button{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:11.5px;color:var(--dim);
  border:1px solid var(--line);border-radius:9px;padding:5px 10px;background:rgba(122,162,255,.05);cursor:pointer;
  transition:color .13s,border-color .13s,background .13s}
.modes button:hover{color:#fff;border-color:var(--ac);background:rgba(79,140,255,.18)}
.modes button i{font-size:11px;color:var(--ac)}
.modes button.dead{opacity:.4;cursor:not-allowed;text-decoration:line-through}
.play{margin-top:auto;display:flex;align-items:center;justify-content:center;gap:9px;width:100%;padding:10px 0;
  border:0;border-radius:11px;background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff;font:inherit;
  font-size:13px;font-weight:600;letter-spacing:1px;cursor:pointer;transition:filter .13s,transform .13s}
.play:hover{filter:brightness(1.12)}
.play:active{transform:translateY(1px)}
.play i{font-size:12px}
.play.exe{background:linear-gradient(135deg,#3ddc84,#1f9c58);color:#04230f}
.play.ghost{background:rgba(122,162,255,.10);color:var(--dim);cursor:not-allowed;border:1px dashed var(--line2)}
.card.miss .cover{filter:grayscale(.7) brightness(.72)}
.card.miss .desc{color:var(--dim2)}
.problem{font-size:11px;color:var(--warn);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.problem code{color:#e8d9b8;background:rgba(255,180,84,.10);border:1px solid rgba(255,180,84,.24);
  border-radius:6px;padding:1px 6px;font-size:10.5px}

/* ---------------- 空状态 / 页脚 / Toast ---------------- */
.empty{display:none;flex-direction:column;align-items:center;gap:12px;padding:70px 20px;color:var(--dim2);text-align:center}
.empty.show{display:flex}
.empty i{font-size:44px;opacity:.5}
.empty h3{margin:0;font-size:15px;color:var(--dim);font-weight:600}
.empty p{margin:0;font-size:12px}
.empty button{margin-top:6px;padding:8px 18px;border:1px solid var(--line2);border-radius:9px;
  background:rgba(79,140,255,.16);color:var(--txt);font:inherit;font-size:12.5px;cursor:pointer}
.empty button:hover{background:rgba(79,140,255,.28)}
.foot{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:10px 22px;border-top:1px solid var(--line);
  font-size:11px;color:var(--dim2);background:rgba(6,10,18,.55)}
.foot kbd{font-family:inherit;font-size:10.5px;border:1px solid var(--line);border-bottom-width:2px;
  border-radius:5px;padding:1px 6px;color:var(--dim);background:rgba(122,162,255,.07)}
.foot .right{margin-left:auto}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,26px);opacity:0;pointer-events:none;
  display:flex;align-items:center;gap:9px;max-width:min(560px,86vw);padding:11px 18px;border-radius:12px;
  border:1px solid var(--line2);background:rgba(12,19,34,.97);box-shadow:0 16px 40px rgba(0,0,0,.62);
  font-size:12.5px;color:var(--txt);transition:opacity .22s,transform .22s;z-index:60}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast i{color:var(--ac)}
.toast.ok i{color:var(--ok)}
.toast.bad i{color:var(--bad)}
.toast.warn i{color:var(--warn)}

@media (max-width:880px){
  .card.hero{grid-column:span 1}
  .side{flex-basis:212px;width:212px}
}
@media (max-width:700px){
  .app{flex-direction:column}
  .side{flex:0 0 auto;width:auto;flex-direction:row;align-items:center;gap:8px;padding:10px;overflow-x:auto}
  .brand{border:0;padding:0 8px 0 0;flex:0 0 auto}
  .brand div{display:none}
  .nav{flex-direction:row}
  .nav .sec,.sideFoot{display:none}
  .nav button{padding:7px 10px;white-space:nowrap}
  .nav button .c{display:none}
  .scroll{padding:0 12px 20px}
}
@media (prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important}
  .card:hover{transform:none}
}
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="brand">
      <div class="logo"><i class="fa-solid fa-gamepad"></i></div>
      <div><h1 id="hallTitle">游戏大厅</h1><p id="hallSub">本地单机合集</p></div>
    </div>
    <nav class="nav" id="nav" aria-label="游戏分类"></nav>
    <div class="sideFoot">
      <button class="sbtn" id="btnRescan"><i class="fa-solid fa-arrows-rotate"></i>重新扫描清单</button>
      <button class="sbtn" id="btnFolderExe"><i class="fa-solid fa-folder-open"></i>程序文件夹</button>
      <button class="sbtn" id="btnFolderWeb"><i class="fa-solid fa-folder-open"></i>游戏文件夹</button>
      <div class="hostTag" id="hostTag"></div>
    </div>
  </aside>

  <main class="main">
    <div class="top">
      <div class="search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="搜索游戏 / 标签 / 玩法…">
        <button class="clr" id="qClr" title="清空"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="seg" id="sortSeg" role="group" aria-label="排序">
        <button data-sort="default">默认</button>
        <button data-sort="name">名称</button>
        <button data-sort="recent">最近</button>
      </div>
    </div>
    <div class="crumbRow">
      <b id="crumbName">全部游戏</b>
      <span class="sep">·</span>
      <span id="crumbCount"></span>
      <span class="sep" id="crumbQSep" hidden>·</span>
      <span id="crumbQ" hidden></span>
    </div>
    <div class="scroll" id="scroll">
      <section class="grid" id="grid"></section>
      <div class="empty" id="empty">
        <i class="fa-solid fa-ghost"></i>
        <h3 id="emptyTitle">没有匹配的游戏</h3>
        <p id="emptyHint">换个关键词，或清除筛选条件试试。</p>
        <button id="emptyBtn">清除筛选</button>
      </div>
    </div>
    <div class="foot">
      <span><kbd>方向键</kbd> 选择　<kbd>Enter</kbd> 开始　<kbd>F</kbd> 收藏　<kbd>/</kbd> 搜索　<kbd>Esc</kbd> 清空</span>
      <span class="right" id="footInfo"></span>
    </div>
  </main>
</div>
<div class="toast" id="toast"><i class="fa-solid fa-circle-info"></i><span id="toastMsg"></span></div>
<script>
window.__HALL__ = __HALL_DATA__;
(function () {
  'use strict';
  var D = window.__HALL__ || { games: [], groups: [], title: '游戏大厅', subtitle: '' };
  var canHost = !!(window.chrome && window.chrome.webview);
  var LS_KEY = 'hall_prefs_v1';
  var prefs = { view: 'all', sort: 'default', fav: [], recent: {} };

  function post(msg) { try { if (canHost) window.chrome.webview.postMessage(msg); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rgba(hex, a) {
    var h = String(hex || '#4f8cff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(79,140,255,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function relTime(ts) {
    if (!ts) return '';
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚玩过';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 86400000 * 30) return Math.floor(d / 86400000) + ' 天前';
    return new Date(ts).toLocaleDateString();
  }

  /* ---------------- 偏好持久化 ---------------- */
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      var o = JSON.parse(raw) || {};
      if (o.view) prefs.view = o.view;
      if (o.sort) prefs.sort = o.sort;
      if (o.fav && o.fav.length !== undefined) prefs.fav = o.fav;
      if (o.recent) prefs.recent = o.recent;
    }
  } catch (e) { }
  function savePrefs() { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch (e) { } }
  function isFav(id) { return prefs.fav.indexOf(id) >= 0; }
  function toggleFav(id) {
    var i = prefs.fav.indexOf(id);
    if (i >= 0) prefs.fav.splice(i, 1); else prefs.fav.push(id);
    savePrefs();
  }
  function markRecent(id) { prefs.recent[id] = Date.now(); savePrefs(); }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg, kind) {
    if (!msg) return;
    var t = $('toast');
    $('toastMsg').textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    t.querySelector('i').className = 'fa-solid ' + (kind === 'bad' ? 'fa-triangle-exclamation'
      : kind === 'ok' ? 'fa-circle-check'
        : kind === 'warn' ? 'fa-circle-exclamation' : 'fa-circle-info');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, kind === 'bad' ? 5200 : 3000);
  }
  if (canHost) {
    try {
      window.chrome.webview.addEventListener('message', function (ev) {
        var m = ev && ev.data;
        if (typeof m !== 'string') return;
        var p = m.split('|');
        if (p[0] === 'toast') toast(p[2] || '', p[1] || '');
      });
    } catch (e) { }
  }

  /* ---------------- 数据整理 ---------------- */
  var byId = {};
  D.games.forEach(function (g) {
    byId[g.id] = g;
    g.tags = g.tags || [];
    g.modes = g.modes || [];
    g.accent = g.accent || '#4f8cff';
    g.cover = g.cover || 'fa-gamepad';
    g.hay = (g.name + ' ' + g.tags.join(' ') + ' ' + (g.desc || '') + ' ' +
      g.modes.map(function (m) { return m.name; }).join(' ')).toLowerCase();
  });
  var groupOf = {};
  D.groups.forEach(function (gr) { groupOf[gr.id] = gr; });
  function groupName(id) { return groupOf[id] ? groupOf[id].name : id; }

  /* ---------------- 视图 ---------------- */
  function viewList() {
    return D.games.filter(function (g) {
      if (prefs.view === 'all') return true;
      if (prefs.view === 'fav') return isFav(g.id);
      if (prefs.view === 'recent') return !!prefs.recent[g.id];
      return g.group === prefs.view;
    });
  }
  function viewGames() {
    var q = ($('q').value || '').trim().toLowerCase();
    var list = viewList().filter(function (g) { return !q || g.hay.indexOf(q) >= 0; });
    if (prefs.sort === 'name') {
      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-Hans-CN'); });
    } else if (prefs.sort === 'recent') {
      list.sort(function (a, b) { return (prefs.recent[b.id] || 0) - (prefs.recent[a.id] || 0); });
    } else {
      list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
    }
    return list;
  }
  function viewLabel() {
    if (prefs.view === 'all') return '全部游戏';
    if (prefs.view === 'fav') return '我的收藏';
    if (prefs.view === 'recent') return '最近游玩';
    return groupName(prefs.view);
  }

  /* ---------------- 侧栏 ---------------- */
  function navBtn(id, icon, name, n) {
    return '<button data-view="' + esc(id) + '"><i class="fa-solid ' + esc(icon) + '"></i>' +
      esc(name) + '<span class="c">' + n + '</span></button>';
  }
  function renderNav() {
    function count(fn) { return D.games.filter(fn).length; }
    var h = '<div class="sec">游戏库</div>';
    h += navBtn('all', 'fa-layer-group', '全部游戏', D.games.length);
    D.groups.forEach(function (gr) {
      h += navBtn(gr.id, gr.icon || 'fa-folder', gr.name, count(function (g) { return g.group === gr.id; }));
    });
    h += '<div class="sec">我的</div>';
    h += navBtn('fav', 'fa-star', '收藏', count(function (g) { return isFav(g.id); }));
    h += navBtn('recent', 'fa-clock-rotate-left', '最近游玩', count(function (g) { return !!prefs.recent[g.id]; }));
    $('nav').innerHTML = h;
    [].forEach.call($('nav').querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === prefs.view);
      b.onclick = function () { prefs.view = b.getAttribute('data-view'); savePrefs(); render(); };
    });
  }

  /* ---------------- 卡片 ---------------- */
  function cardHtml(g) {
    var modes = g.modes, isExec = g.kind === 'exe';
    var cls = 'card' + (g.featured ? ' hero' : '') + (g.exists ? '' : ' miss');
    var h = '<article class="' + cls + '" tabindex="0" role="button" data-id="' + esc(g.id) + '" ' +
      'aria-label="' + esc(g.name) + '" style="--ac:' + esc(g.accent) + ';--acs:' + rgba(g.accent, .3) + '">';
    h += '<div class="cover">';
    h += '<i class="fa-solid ' + esc(g.cover) + ' glyph" aria-hidden="true"></i>';
    h += '<span class="kind">' + (isExec ? '本地程序' : '网页游戏') + '</span>';
    if (g.featured) h += '<span class="ribbon">主打</span>';
    h += '<button class="star' + (isFav(g.id) ? ' on' : '') + '" data-fav="' + esc(g.id) + '" ' +
      'title="收藏 / 取消收藏" aria-label="收藏"><i class="fa-solid fa-star"></i></button>';
    h += '</div>';
    h += '<div class="body">';
    h += '<div class="titleRow"><h2>' + esc(g.name) + '</h2>' +
      (modes.length > 1 ? '<span class="n">' + modes.length + ' 个页面 · 同一份存档</span>' : '') +
      (prefs.recent[g.id] ? '<span class="ago">' + esc(relTime(prefs.recent[g.id])) + '</span>' : '') + '</div>';
    h += '<p class="desc">' + esc(g.desc || '') + '</p>';
    if (g.tags.length) {
      h += '<div class="tags">' + g.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>';
    }
    if (!g.exists) {
      h += '<div class="problem"><i class="fa-solid fa-triangle-exclamation"></i>文件缺失 <code>' + esc(g.path) + '</code></div>';
    } else if (modes.length > 1) {
      h += '<div class="modes">';
      modes.forEach(function (m) {
        h += '<button data-mode="' + esc(m.id) + '"' + (m.exists ? '' : ' class="dead"') +
          ' title="' + esc((m.desc || m.name) + (m.exists ? '' : '（文件缺失）')) + '">' +
          '<i class="fa-solid ' + esc(m.icon || 'fa-circle-play') + '"></i>' + esc(m.name) + '</button>';
      });
      h += '</div>';
    }
    if (g.exists) {
      h += '<button class="play' + (isExec ? ' exe' : '') + '" data-play="' + esc(g.id) + '">' +
        '<i class="fa-solid ' + (isExec ? 'fa-power-off' : 'fa-play') + '"></i>' +
        (isExec ? '启动程序' : (modes.length > 1 ? '从主页开始' : '开始游戏')) + '</button>';
    } else {
      h += '<button class="play ghost" disabled><i class="fa-solid fa-ban"></i>无法启动</button>';
    }
    h += '</div></article>';
    return h;
  }

  function render() {
    renderNav();
    var list = viewGames(), all = viewList().length;
    $('grid').innerHTML = list.map(cardHtml).join('');
    $('crumbName').textContent = viewLabel();
    $('crumbCount').textContent = (list.length === all) ? (all + ' 款游戏') : (list.length + ' / ' + all + ' 款游戏');
    var q = ($('q').value || '').trim();
    $('crumbQSep').hidden = !q;
    $('crumbQ').hidden = !q;
    $('crumbQ').textContent = q ? ('搜索「' + q + '」') : '';
    $('qClr').style.display = q ? 'block' : 'none';
    $('empty').className = 'empty' + (list.length ? '' : ' show');
    $('emptyTitle').textContent = q ? '没有匹配的游戏'
      : prefs.view === 'fav' ? '还没有收藏'
        : prefs.view === 'recent' ? '还没有游玩记录' : '这里暂时是空的';
    $('emptyHint').textContent = q ? '换个关键词，或清除筛选条件试试。'
      : prefs.view === 'fav' ? '点卡片封面右上角的星标，就会出现在这里。'
        : prefs.view === 'recent' ? '开始任意一款游戏后，它会出现在这里。' : '检查 games.json 清单。';
    var ready = D.games.filter(function (g) { return g.exists; }).length;
    $('footInfo').textContent = '共 ' + D.games.length + ' 款 · 可启动 ' + ready + ' 款 · 清单 games.json';
  }

  /* ---------------- 启动 ---------------- */
  function findGame(id) { return byId[id]; }
  function modeOf(g, id) {
    var out = null;
    (g.modes || []).forEach(function (m) { if (m.id === id) out = m; });
    return out;
  }
  function launch(g, mode) {
    if (!g) return;
    if (g.kind === 'exe') {
      if (canHost) { post('exe:' + g.id); toast('正在启动 ' + g.name + ' …', 'ok'); }
      else toast('浏览器模式无法启动本地程序，请用 游戏大厅.exe 打开大厅。', 'warn');
      return;
    }
    if (mode && !mode.exists) { toast('这个页面的文件缺失：' + mode.path, 'bad'); return; }
    if (!g.exists) { toast('文件缺失，无法打开：' + g.path, 'bad'); return; }
    markRecent(g.id);
    if (canHost) {
      post('web:' + g.id + (mode ? ':' + mode.id : ''));
      toast('正在打开 ' + g.name + (mode ? ' · ' + mode.name : '') + ' …', 'ok');
    } else {
      location.href = mode ? mode.url : g.url;
    }
  }

  /* ---------------- 事件 ---------------- */
  $('grid').addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var star = t.closest('[data-fav]');
    if (star) {
      var fid = star.getAttribute('data-fav');
      toggleFav(fid);
      star.classList.toggle('on', isFav(fid));
      renderNav();
      if (prefs.view === 'fav') render();
      toast(isFav(fid) ? '已加入收藏' : '已取消收藏', isFav(fid) ? 'ok' : '');
      return;
    }
    var card = t.closest('.card');
    if (!card) return;
    var g = findGame(card.getAttribute('data-id'));
    var mb = t.closest('[data-mode]');
    if (mb) { launch(g, modeOf(g, mb.getAttribute('data-mode'))); return; }
    launch(g, null);
  });
  $('grid').addEventListener('keydown', function (e) {
    var card = e.target.closest ? e.target.closest('.card') : null;
    if (!card) return;
    var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (dir) { e.preventDefault(); focusByDir(dir); return; }
    var id = card.getAttribute('data-id');
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launch(findGame(id), null); return; }
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFav(id);
      var s = card.querySelector('[data-fav]');
      if (s) s.classList.toggle('on', isFav(id));
      renderNav();
      toast(isFav(id) ? '已加入收藏' : '已取消收藏', isFav(id) ? 'ok' : '');
    }
  });
  function focusByDir(dir) {
    var cards = [].slice.call($('grid').querySelectorAll('.card'));
    if (!cards.length) return;
    var cur = document.activeElement, i = cards.indexOf(cur);
    if (i < 0) { cards[0].focus(); cards[0].scrollIntoView({ block: 'nearest' }); return; }
    var r = cur.getBoundingClientRect(), best = null, bestScore = 1e9;
    var horizontal = (dir === 'left' || dir === 'right');
    cards.forEach(function (c) {
      if (c === cur) return;
      var b = c.getBoundingClientRect();
      var dx = (b.left + b.width / 2) - (r.left + r.width / 2);
      var dy = (b.top + b.height / 2) - (r.top + r.height / 2);
      var ok = dir === 'left' ? dx < -8 : dir === 'right' ? dx > 8 : dir === 'up' ? dy < -8 : dy > 8;
      if (!ok) return;
      var score = (horizontal ? Math.abs(dx) : Math.abs(dy)) + (horizontal ? Math.abs(dy) : Math.abs(dx)) * 2.4;
      if (score < bestScore) { bestScore = score; best = c; }
    });
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  }

  var qEl = $('q'), qTimer = null;
  qEl.addEventListener('input', function () { clearTimeout(qTimer); qTimer = setTimeout(render, 90); });
  qEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { qEl.value = ''; render(); qEl.blur(); }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      var first = $('grid').querySelector('.card');
      if (first) { e.preventDefault(); first.focus(); }
    }
  });
  $('qClr').onclick = function () { qEl.value = ''; render(); qEl.focus(); };

  [].forEach.call($('sortSeg').querySelectorAll('button'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-sort') === prefs.sort);
    b.onclick = function () {
      prefs.sort = b.getAttribute('data-sort');
      savePrefs();
      [].forEach.call($('sortSeg').querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
      render();
    };
  });

  $('btnRescan').onclick = function () { post('reload'); toast('正在重新读取 games.json …'); };
  $('btnFolderExe').onclick = function () { post('folder:EXE'); };
  $('btnFolderWeb').onclick = function () { post('folder:game/程序'); };
  $('emptyBtn').onclick = function () { qEl.value = ''; prefs.view = 'all'; savePrefs(); render(); };

  document.addEventListener('keydown', function (e) {
    var ae = document.activeElement;
    var inField = ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName);
    if ((e.key === '/' && !inField) || (e.key.toLowerCase() === 'f' && e.ctrlKey)) {
      e.preventDefault(); qEl.focus(); qEl.select();
    }
  });

  $('hallTitle').textContent = D.title || '游戏大厅';
  $('hallSub').textContent = D.subtitle || '本地单机合集';
  document.title = D.title || '游戏大厅';
  $('hostTag').innerHTML = canHost
    ? '本窗口 = <b>单个 WebView2</b><br>网页游戏在原窗口内打开'
    : '浏览器模式<br>仅网页游戏可直接玩';
  render();

  window.__hallApi = { launch: launch, render: render, toast: toast, prefs: prefs };
})();
</script>
</body>
</html>
)HALLPAGE";
