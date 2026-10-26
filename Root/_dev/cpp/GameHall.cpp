// ============================================================================
//  游戏大厅 · 单 WebView2 启动器
//  ---------------------------------------------------------------------------
//  设计原则(一句话): **一个进程 / 一个窗口 / 一个 WebView2**。
//  大厅页与所有网页游戏都在同一个 WebView2 里导航切换, 不再有第二个浏览器实例、
//  第二个窗口或第二份内核; 网页游戏点击后是 Navigate(原地跳转), EXE 游戏由宿主
//  ShellExecuteW 起独立进程(那是游戏本体, 不属于大厅)。
//
//  与旧版的区别:
//    * 游戏清单来自同目录 games.json(v2: 支持 modes 子页面 / 封面图标 / 主题色),
//      新增或改名只改 JSON, 不用重编译;
//    * 「破门而入」的四个页面在清单里合成**一款游戏**, 四个页面是它的四个模式;
//    * 不再有原生工具条 —— 整个客户区就是 WebView2, 页面自己带侧栏与顶栏;
//      进入游戏后由宿主注入一条「← 游戏大厅」浮条(鼠标移到窗口顶部才出现),
//      不会遮挡游戏 HUD; 另有 F1 / Alt+← 随时返回;
//    * 本地内容用 SetVirtualHostNameToFolderMapping 映射成 https://hall.local/,
//      拿到真正的同源 origin 与 secure context(实测: 四个破门而入页面在新旧两种
//      基址下 localStorage 都是共享的, 但 file:// origin 属于 Chromium 长期要收紧的
//      历史行为, 所以默认用虚拟主机); 运行库不支持时自动退回 file:// 并做百分号编码;
//    * 换 origin 不能让玩家的存档凭空清零 —— 首次启动会做一次**一次性迁移**:
//      从 file:// 读旧档 -> 写进 https://hall.local -> 落标记文件, 之后不再执行;
//      迁移失败也绝不影响进大厅(只记日志); 用 --file 可强制走旧基址;
//    * NewWindowRequested 一律拦下: 本地页面复用同一个 WebView2, 外链交给系统浏览器
//      —— 从机制上保证"永远只有一个 WebView2";
//    * 暗色窗口背景 + DefaultBackgroundColor, 消除启动白闪;
//    * 内建自检: 
//        --selftest [--vhost|--file]  依次加载主页/整备页/大厅页, 打印 origin、
//                                     localStorage 同源情况与卡片数量;
//        --probe-all                  逐个打开**所有**网页游戏(含 modes 子页面),
//                                     报标题/正文长度/canvas 尺寸/JS 错误数 —— 
//                                     "每个游戏到底打不打得开"的最终证据;
//        --probe <相对路径>            只测一个页面(排查单个游戏时用)。
//
//  构建: _dev\cpp\build_game_hall.bat  ->  Z:\Root\游戏大厅.exe
//        默认编 **32 位(x86)**: 32 位 Windows 原生运行, 64 位 Windows 走 WOW64 也照样运行,
//        一套产物覆盖两种系统(WebView2 浏览器进程仍按系统架构起, 64 位系统上就是 64 位);
//        WebView2 加载器静态链入(WebView2LoaderStatic.lib), 不再需要 WebView2Loader.dll。
//  依赖: 系统 Edge WebView2 Runtime(32 位系统装 x86 运行时)
// ============================================================================
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <wrl/client.h>
#include <wrl/event.h>
#include <WebView2.h>
#include "HallPage.hpp"

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

// ---------- 全局 ----------
static std::wstring g_dir;          // exe 所在目录(尾带 '\')
static std::wstring g_manifest;     // games.json 完整路径
static std::wstring g_hallFile;     // 生成的大厅页
static std::wstring g_hallUrl;      // 大厅页 URL
static std::wstring g_base;         // 资源根 URL(尾带 '/')
static ComPtr<ICoreWebView2Controller> g_ctl;
static ComPtr<ICoreWebView2>           g_web;
static HWND g_hwnd = NULL;
static bool g_webviewOk = false;
static bool g_wantVHost = true;     // 是否尝试虚拟主机映射
static bool g_vhostOk = false;
static bool g_inGame = false;       // 当前是否停在某个游戏页(而非大厅)
static std::wstring g_curGame;      // 当前游戏名(用于窗口标题)
static int  g_exitCode = 0;
static RECT g_savedRect = {};
static bool g_fullscreen = false;

// ---------------- 字符串 ----------------
static std::string toUtf8(const std::wstring& w) {
    if (w.empty()) return std::string();
    int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), NULL, 0, NULL, NULL);
    std::string s(n, 0);
    WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, NULL, NULL);
    return s;
}
static std::wstring toWide(const std::string& s) {
    if (s.empty()) return std::wstring();
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), NULL, 0);
    std::wstring w(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
    return w;
}
static void printLine(const std::string& s) {
    HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD w = 0;
    if (h && h != INVALID_HANDLE_VALUE) WriteFile(h, s.data(), (DWORD)s.size(), &w, NULL);
}
static std::string hex32(unsigned v) {
    char b[16]; sprintf_s(b, "0x%08X", v); return std::string(b);
}

// ---------------- JSON 读取器(只服务本项目的 games.json) ----------------
namespace json {
struct P {
    const std::string& s; size_t i = 0;
    explicit P(const std::string& src) : s(src) {}
    void ws() { while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) i++; }
    bool eat(char c) { ws(); if (i < s.size() && s[i] == c) { i++; return true; } return false; }
    bool peek(char c) { ws(); return i < s.size() && s[i] == c; }
    bool boolean() {
        ws();
        if (s.compare(i, 4, "true") == 0) { i += 4; return true; }
        if (s.compare(i, 5, "false") == 0) { i += 5; return false; }
        value(); return false;
    }
    std::string str() {
        std::string out; ws();
        if (i >= s.size() || s[i] != '"') return out;
        i++;
        while (i < s.size() && s[i] != '"') {
            char c = s[i++];
            if (c == '\\' && i < s.size()) {
                char e = s[i++];
                switch (e) {
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u': {
                        unsigned cp = 0;
                        for (int k = 0; k < 4 && i < s.size(); k++) {
                            char h = s[i++]; cp <<= 4;
                            if (h >= '0' && h <= '9') cp |= (h - '0');
                            else if (h >= 'a' && h <= 'f') cp |= (h - 'a' + 10);
                            else if (h >= 'A' && h <= 'F') cp |= (h - 'A' + 10);
                        }
                        if (cp < 0x80) out += (char)cp;
                        else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
                        else { out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
                        break;
                    }
                    default: out += e;
                }
            } else out += c;
        }
        if (i < s.size()) i++;
        return out;
    }
    void value() {
        ws();
        if (i >= s.size()) return;
        char c = s[i];
        if (c == '"') { str(); return; }
        if (c == '{' || c == '[') {
            char open = c, close = (c == '{') ? '}' : ']';
            int depth = 0;
            while (i < s.size()) {
                char d = s[i++];
                if (d == '"') { i--; str(); continue; }
                if (d == open) depth++;
                else if (d == close) { depth--; if (!depth) return; }
            }
            return;
        }
        while (i < s.size() && s[i] != ',' && s[i] != '}' && s[i] != ']') i++;
    }
};
} // namespace json

// ---------------- 数据 ----------------
struct Mode {
    std::wstring id, name, icon, path, desc;
    bool exists = false;
};
struct Game {
    std::wstring id, name, group, kind, path, cover, accent, tags, desc;
    std::vector<std::wstring> tagList;
    std::vector<Mode> modes;
    bool featured = false;
    bool exists = false;
};
struct Group { std::wstring id, name, icon, hint; };
struct Hall {
    std::wstring title = L"游戏大厅", subtitle = L"本地单机游戏合集";
    std::vector<Group> groups;
    std::vector<Game> games;
};
static Hall g_hall;

static bool readFile(const std::wstring& p, std::string& out) {
    std::ifstream f(p.c_str(), std::ios::binary);
    if (!f) return false;
    std::ostringstream ss; ss << f.rdbuf();
    out = ss.str();
    return true;
}

static bool loadManifest(const std::wstring& path, Hall& hall) {
    std::string text;
    if (!readFile(path, text)) return false;
    if (text.compare(0, 3, "\xEF\xBB\xBF") == 0) text.erase(0, 3);

    json::P p(text);
    if (!p.eat('{')) return false;
    while (!p.peek('}') && p.i < text.size()) {
        std::string key = p.str();
        if (!p.eat(':')) break;
        if (key == "title") hall.title = toWide(p.str());
        else if (key == "subtitle") hall.subtitle = toWide(p.str());
        else if (key == "groups") {
            if (!p.eat('[')) { p.value(); }
            else {
                while (!p.peek(']') && p.i < text.size()) {
                    if (!p.eat('{')) break;
                    Group gr;
                    while (!p.peek('}') && p.i < text.size()) {
                        std::string k = p.str();
                        if (!p.eat(':')) break;
                        if (k == "id") gr.id = toWide(p.str());
                        else if (k == "name") gr.name = toWide(p.str());
                        else if (k == "icon") gr.icon = toWide(p.str());
                        else if (k == "hint") gr.hint = toWide(p.str());
                        else p.value();
                        if (!p.eat(',')) break;
                    }
                    p.eat('}');
                    hall.groups.push_back(gr);
                    if (!p.eat(',')) break;
                }
                p.eat(']');
            }
        } else if (key == "games") {
            if (!p.eat('[')) { p.value(); }
            else {
                while (!p.peek(']') && p.i < text.size()) {
                    if (!p.eat('{')) break;
                    Game ga;
                    while (!p.peek('}') && p.i < text.size()) {
                        std::string k = p.str();
                        if (!p.eat(':')) break;
                        if (k == "id") ga.id = toWide(p.str());
                        else if (k == "name") ga.name = toWide(p.str());
                        else if (k == "group") ga.group = toWide(p.str());
                        else if (k == "kind") ga.kind = toWide(p.str());
                        else if (k == "path") ga.path = toWide(p.str());
                        else if (k == "desc") ga.desc = toWide(p.str());
                        else if (k == "cover") ga.cover = toWide(p.str());
                        else if (k == "accent") ga.accent = toWide(p.str());
                        else if (k == "featured") ga.featured = p.boolean();
                        else if (k == "tags") {
                            if (p.eat('[')) {
                                while (!p.peek(']') && p.i < text.size()) {
                                    std::wstring t = toWide(p.str());
                                    ga.tagList.push_back(t);
                                    if (!ga.tags.empty()) ga.tags += L" · ";
                                    ga.tags += t;
                                    if (!p.eat(',')) break;
                                }
                                p.eat(']');
                            } else p.value();
                        } else if (k == "modes") {
                            if (p.eat('[')) {
                                while (!p.peek(']') && p.i < text.size()) {
                                    if (!p.eat('{')) break;
                                    Mode m;
                                    while (!p.peek('}') && p.i < text.size()) {
                                        std::string mk = p.str();
                                        if (!p.eat(':')) break;
                                        if (mk == "id") m.id = toWide(p.str());
                                        else if (mk == "name") m.name = toWide(p.str());
                                        else if (mk == "icon") m.icon = toWide(p.str());
                                        else if (mk == "path") m.path = toWide(p.str());
                                        else if (mk == "desc") m.desc = toWide(p.str());
                                        else p.value();
                                        if (!p.eat(',')) break;
                                    }
                                    p.eat('}');
                                    ga.modes.push_back(m);
                                    if (!p.eat(',')) break;
                                }
                                p.eat(']');
                            } else p.value();
                        } else p.value();
                        if (!p.eat(',')) break;
                    }
                    p.eat('}');
                    if (ga.accent.empty()) ga.accent = L"#4f8cff";
                    if (ga.cover.empty()) ga.cover = L"fa-gamepad";
                    hall.games.push_back(ga);
                    if (!p.eat(',')) break;
                }
                p.eat(']');
            }
        } else p.value();
        if (!p.eat(',')) break;
    }
    return !hall.games.empty();
}

// ---------- 内置兜底清单(找不到 games.json 时使用) ----------
static void fallbackHall(Hall& hall) {
    hall.title = L"游戏大厅";
    hall.subtitle = L"本地单机游戏合集 (未找到 games.json, 使用内置清单)";
    hall.groups = { { L"web", L"网页游戏", L"fa-window-maximize", L"在本窗口内直接游玩" },
                    { L"exe", L"本地程序", L"fa-desktop", L"启动独立程序" } };
    auto add = [&](const wchar_t* id, const wchar_t* name, const wchar_t* group, const wchar_t* path,
                   const wchar_t* cover, const wchar_t* accent, const wchar_t* desc) {
        Game g; g.id = id; g.name = name; g.group = group; g.path = path; g.desc = desc;
        g.kind = (std::wstring(group) == L"exe") ? L"exe" : L"web";
        g.cover = cover; g.accent = accent;
        hall.games.push_back(g);
    };
    Game br;
    br.id = L"breach"; br.name = L"破门而入"; br.group = L"web"; br.kind = L"web";
    br.path = L"game/breach/index.html"; br.cover = L"fa-crosshairs"; br.accent = L"#ffc256";
    br.featured = true;
    br.desc = L"室内战术射击合集 v2.0：五张战役地图 / 18 项升级 / 15 项成就 / 3 个存档位 / 训练场，外加丧尸围城长街尸潮。";
    br.tagList = { L"战术射击", L"战役", L"四页一体" };
    br.tags = L"战术射击 · 战役 · 四页一体";
    auto m = [](const wchar_t* id, const wchar_t* name, const wchar_t* icon, const wchar_t* path) {
        Mode mm; mm.id = id; mm.name = name; mm.icon = icon; mm.path = path; return mm;
    };
    br.modes = { m(L"home", L"主页 · 教程", L"fa-house", L"game/breach/index.html"),
                 m(L"hub", L"战前准备", L"fa-screwdriver-wrench", L"game/breach/game/hub.html"),
                 m(L"campaign", L"战役 · 红蓝对抗", L"fa-crosshairs", L"game/breach/game/breach.html"),
                 m(L"street", L"丧尸围城", L"fa-skull", L"game/breach/game/street.html") };
    hall.games.push_back(br);
    add(L"snake", L"贪吃蛇", L"web", L"game/贪吃蛇.html", L"fa-worm", L"#3ddc84", L"经典贪吃蛇");
    add(L"shooter", L"太空射手", L"web", L"game/太空射手.html", L"fa-rocket", L"#5fb0ff", L"竖版弹幕射击");
    add(L"tetris", L"俄罗斯方块", L"web", L"game/俄罗斯方块.html", L"fa-cubes", L"#c084fc", L"经典俄罗斯方块");
    add(L"minesweeper", L"扫雷", L"web", L"game/扫雷/扫雷游戏.html", L"fa-bomb", L"#f87171", L"经典扫雷(无猜模式)");
    add(L"zombie", L"丧尸末日", L"exe", L"game/程序/丧尸末日.exe", L"fa-biohazard", L"#84cc16", L"生存模拟");
    add(L"loopday", L"如果你被困在了同一天", L"exe", L"game/程序/如果你被困在了同一天.exe", L"fa-clock-rotate-left", L"#38bdf8", L"时间循环文字冒险");
    add(L"werewolf", L"狼人杀", L"exe", L"game/程序/狼人杀.exe", L"fa-user-secret", L"#a78bfa", L"身份推理对局");
    add(L"catkingdom", L"猫国建设者", L"exe", L"game/程序/猫国建设者.exe", L"fa-cat", L"#fbbf24", L"放置经营");
}

// ---------------- 路径 / URL ----------------
static std::wstring joinPath(const std::wstring& dir, const std::wstring& rel) {
    std::wstring r = rel;
    for (auto& c : r) if (c == L'/') c = L'\\';
    return dir + r;
}
// 百分号编码: 只保留 URL 里安全的部分, 中文/空格/& 等一律转义
static std::wstring pctEncode(const std::wstring& in, bool keepSlash) {
    std::string u = toUtf8(in);
    static const char* hex = "0123456789ABCDEF";
    std::wstring out;
    out.reserve(u.size() * 2);
    for (unsigned char c : u) {
        bool safe = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
                    c == '-' || c == '_' || c == '.' || c == '~';
        if (keepSlash && (c == '/' || c == ':')) safe = true;
        if (safe) out += (wchar_t)c;
        else { out += L'%'; out += (wchar_t)hex[c >> 4]; out += (wchar_t)hex[c & 15]; }
    }
    return out;
}
static std::wstring fileBaseOf(const std::wstring& dir) {
    std::wstring d = dir;
    for (auto& c : d) if (c == L'\\') c = L'/';
    return L"file:///" + pctEncode(d, true);
}
static std::wstring urlOf(const std::wstring& rel) { return g_base + pctEncode(rel, true); }
// 强制 file:// 基址的 URL(一次性迁移读旧档时用)
static std::wstring fileUrlOf(const std::wstring& rel) { return fileBaseOf(g_dir) + pctEncode(rel, true); }
static std::wstring esc(const std::wstring& in) {
    std::wstring o;
    for (wchar_t c : in) {
        switch (c) {
            case L'&': o += L"&amp;"; break;
            case L'<': o += L"&lt;"; break;
            case L'>': o += L"&gt;"; break;
            case L'"': o += L"&quot;"; break;
            case L'\'': o += L"&#39;"; break;
            default: o += c;
        }
    }
    return o;
}
static std::wstring jsonStr(const std::wstring& in) {
    std::wstring o = L"\"";
    for (wchar_t c : in) {
        switch (c) {
            case L'"':  o += L"\\\""; break;
            case L'\\': o += L"\\\\"; break;
            case L'\n': o += L"\\n"; break;
            case L'\r': o += L"\\r"; break;
            case L'\t': o += L"\\t"; break;
            default:
                if (c < 0x20) { wchar_t b[16]; swprintf_s(b, L"\\u%04x", (unsigned)c); o += b; }
                else o += c;
        }
    }
    o += L"\"";
    return o;
}

// ---------------- 生成大厅页 ----------------
static std::wstring buildDataJson() {
    std::wstring j = L"{";
    j += L"\"title\":" + jsonStr(g_hall.title) + L",";
    j += L"\"subtitle\":" + jsonStr(g_hall.subtitle) + L",";
    j += L"\"base\":" + jsonStr(g_base) + L",";
    j += L"\"host\":" + std::wstring(g_vhostOk ? L"true" : L"false") + L",";
    j += L"\"groups\":[";
    for (size_t i = 0; i < g_hall.groups.size(); i++) {
        const Group& gr = g_hall.groups[i];
        if (i) j += L",";
        j += L"{\"id\":" + jsonStr(gr.id) + L",\"name\":" + jsonStr(gr.name) +
             L",\"icon\":" + jsonStr(gr.icon.empty() ? L"fa-folder" : gr.icon) +
             L",\"hint\":" + jsonStr(gr.hint) + L"}";
    }
    j += L"],\"games\":[";
    for (size_t i = 0; i < g_hall.games.size(); i++) {
        const Game& g = g_hall.games[i];
        if (i) j += L",";
        j += L"{\"id\":" + jsonStr(g.id) + L",\"name\":" + jsonStr(g.name) +
             L",\"group\":" + jsonStr(g.group) + L",\"kind\":" + jsonStr(g.kind) +
             L",\"path\":" + jsonStr(g.path) + L",\"url\":" + jsonStr(urlOf(g.path)) +
             L",\"cover\":" + jsonStr(g.cover) + L",\"accent\":" + jsonStr(g.accent) +
             L",\"desc\":" + jsonStr(g.desc) +
             L",\"featured\":" + std::wstring(g.featured ? L"true" : L"false") +
             L",\"exists\":" + std::wstring(g.exists ? L"true" : L"false") + L",\"tags\":[";
        for (size_t t = 0; t < g.tagList.size(); t++) {
            if (t) j += L",";
            j += jsonStr(g.tagList[t]);
        }
        j += L"],\"modes\":[";
        for (size_t m = 0; m < g.modes.size(); m++) {
            const Mode& md = g.modes[m];
            if (m) j += L",";
            j += L"{\"id\":" + jsonStr(md.id) + L",\"name\":" + jsonStr(md.name) +
                 L",\"icon\":" + jsonStr(md.icon.empty() ? L"fa-circle-play" : md.icon) +
                 L",\"path\":" + jsonStr(md.path) + L",\"url\":" + jsonStr(urlOf(md.path)) +
                 L",\"desc\":" + jsonStr(md.desc) +
                 L",\"exists\":" + std::wstring(md.exists ? L"true" : L"false") + L"}";
        }
        j += L"]}";
    }
    j += L"]}";
    return j;
}

static void writeHallPage() {
    CreateDirectoryW((g_dir + L"_runtime").c_str(), NULL);   // 运行时目录, 不存在就建
    std::wstring page = kHallPageTemplate;
    std::wstring data = buildDataJson();
    size_t at = page.find(L"__HALL_DATA__");
    if (at != std::wstring::npos) page.replace(at, 13, data);
    std::string utf8 = toUtf8(page);
    std::ofstream f(g_hallFile.c_str(), std::ios::binary | std::ios::trunc);
    f.write(utf8.data(), (std::streamsize)utf8.size());
}

// ---------------- 动作 ----------------
static const Game* findGame(const std::wstring& id) {
    for (auto& g : g_hall.games) if (g.id == id) return &g;
    return NULL;
}
static void refreshExists() {
    for (auto& g : g_hall.games) {
        g.exists = (GetFileAttributesW(joinPath(g_dir, g.path).c_str()) != INVALID_FILE_ATTRIBUTES);
        for (auto& m : g.modes)
            m.exists = (GetFileAttributesW(joinPath(g_dir, m.path).c_str()) != INVALID_FILE_ATTRIBUTES);
    }
}
static void toast(const wchar_t* kind, const std::wstring& msg) {
    if (!g_web) return;
    std::wstring m = std::wstring(L"toast|") + kind + L"|" + msg;
    g_web->PostWebMessageAsString(m.c_str());
}
static void setTitle() {
    std::wstring t = g_hall.title;
    if (g_inGame && !g_curGame.empty()) t += L" — " + g_curGame;
    else t += L" · 单窗口启动器";
    SetWindowTextW(g_hwnd, t.c_str());
}
static void goHall() {
    g_inGame = false; g_curGame.clear();
    if (g_web) g_web->Navigate(g_hallUrl.c_str());
    setTitle();
}
static void actWeb(const Game& g, const Mode* m) {
    std::wstring url = urlOf(m ? m->path : g.path);
    g_inGame = true;
    g_curGame = m ? (g.name + L" · " + m->name) : g.name;
    if (g_web) g_web->Navigate(url.c_str());
    setTitle();
}
static void actExe(const Game& g) {
    std::wstring full = joinPath(g_dir, g.path);
    HINSTANCE r = ShellExecuteW(NULL, L"open", full.c_str(), NULL, g_dir.c_str(), SW_SHOWNORMAL);
    if ((INT_PTR)r <= 32) {
        toast(L"bad", L"启动失败: " + g.path);
        MessageBoxW(g_hwnd, (L"启动失败: " + full).c_str(), L"游戏大厅", MB_ICONWARNING | MB_OK);
    } else {
        toast(L"ok", L"已启动 " + g.name);
    }
}
static void rescanAndReload() {
    Hall h;
    if (loadManifest(g_manifest, h)) g_hall = h;
    refreshExists();
    writeHallPage();
    goHall();
}
static void openFolder(const std::wstring& sub) {
    std::wstring s = sub;
    for (auto& c : s) if (c == L'/') c = L'\\';      // 页面发来的是 URL 风格路径
    std::wstring p = g_dir + s;
    if (GetFileAttributesW(p.c_str()) == INVALID_FILE_ATTRIBUTES) p = g_dir + L"game";
    if (GetFileAttributesW(p.c_str()) == INVALID_FILE_ATTRIBUTES) p = g_dir;
    ShellExecuteW(NULL, L"open", p.c_str(), NULL, NULL, SW_SHOWNORMAL);
}
static void toggleFullscreen() {
    if (!g_hwnd) return;
    if (!g_fullscreen) {
        GetWindowRect(g_hwnd, &g_savedRect);
        MONITORINFO mi = { sizeof(mi) };
        HMONITOR mon = MonitorFromWindow(g_hwnd, MONITOR_DEFAULTTONEAREST);
        GetMonitorInfoW(mon, &mi);
        SetWindowLongPtrW(g_hwnd, GWL_STYLE, WS_POPUP | WS_VISIBLE);
        SetWindowPos(g_hwnd, HWND_TOP, mi.rcMonitor.left, mi.rcMonitor.top,
            mi.rcMonitor.right - mi.rcMonitor.left, mi.rcMonitor.bottom - mi.rcMonitor.top,
            SWP_FRAMECHANGED);
        g_fullscreen = true;
    } else {
        SetWindowLongPtrW(g_hwnd, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE);
        SetWindowPos(g_hwnd, NULL, g_savedRect.left, g_savedRect.top,
            g_savedRect.right - g_savedRect.left, g_savedRect.bottom - g_savedRect.top,
            SWP_FRAMECHANGED);
        g_fullscreen = false;
    }
}

// ---------- 注入到每个页面的「返回大厅」浮条 ----------
// 平时完全隐藏(不遮挡游戏 HUD), 鼠标移到窗口顶部 60px 内才滑出; F1 / Alt+← 也能返回。
static const wchar_t* kShimScript = LR"SHIM((function(){
  try{
    // 先挂错误收集器(所有页面都要, 包括大厅页) —— 供 --probe-all / --probe 检查
    // "页面在真 WebView2 里到底有没有报错"。
    if(!window.__hallErrors){
      window.__hallErrors=[];
      var push=function(s){ if(window.__hallErrors.length<10) window.__hallErrors.push(String(s)); };
      window.addEventListener('error',function(ev){
        push((ev&&ev.message?ev.message:'?')+' @'+((ev&&ev.lineno)||0)+':'+((ev&&ev.colno)||0));
      },true);
      window.addEventListener('unhandledrejection',function(ev){ push('unhandled: '+(ev&&ev.reason)); });
    }
    // 探针/自检模式: 把阻塞式对话框换成"记录 + 默认回答"。
    // 一个加载期的 confirm 就足以让探针永远等不到 load(俄罗斯方块的
    // "检测到未完成游戏, 是否恢复?" 正是如此), 正常游玩时完全不干预。
    if(window.__hallProbeMode && !window.__hallDialogs){
      window.__hallDialogs=[];
      var D=window.__hallDialogs;
      window.alert=function(m){ D.push('alert: '+m); };
      window.confirm=function(m){ D.push('confirm: '+m); return false; };
      window.prompt=function(m,v){ D.push('prompt: '+m); return null; };
    }
    if(document.documentElement && document.documentElement.hasAttribute('data-hall-page')) return;
    function boot(){
      if(!document.documentElement || document.documentElement.hasAttribute('data-hall-page')) return;
      if(document.getElementById('__hallReturnBar')) return;
      var bar=document.createElement('div');
      bar.id='__hallReturnBar';
      bar.setAttribute('style','position:fixed;top:0;left:0;right:0;height:56px;display:flex;'+
        'align-items:flex-start;justify-content:center;pointer-events:none;z-index:2147483647');
      var btn=document.createElement('button');
      btn.type='button'; btn.title='返回游戏大厅 (F1 / Alt+←)';
      btn.innerHTML='&#8592;&nbsp;游戏大厅';
      btn.setAttribute('style','pointer-events:auto;margin-top:7px;opacity:0;transform:translateY(-190%);'+
        'transition:opacity .2s ease,transform .2s ease;font:600 12.5px/1 "Microsoft YaHei",sans-serif;'+
        'color:#e9eefb;background:rgba(10,16,30,.94);border:1px solid rgba(122,162,255,.34);'+
        'border-radius:999px;padding:9px 17px;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.6)');
      function show(){ clearTimeout(bar.__t); btn.style.opacity='1'; btn.style.transform='translateY(0)'; }
      function hide(d){ clearTimeout(bar.__t); bar.__t=setTimeout(function(){
        btn.style.opacity='0'; btn.style.transform='translateY(-190%)'; }, d||380); }
      btn.addEventListener('mouseenter', function(){ show(); });
      btn.addEventListener('mouseleave', function(){ hide(); });
      btn.addEventListener('click', function(){
        try{ window.chrome.webview.postMessage('hall'); }catch(e){}
      });
      document.addEventListener('mousemove', function(e){
        if(e.clientY<=60){ show(); clearTimeout(bar.__t); bar.__t=setTimeout(hide, 2600); }
        else if(e.clientY>120) hide();
      }, true);
      bar.appendChild(btn);
      document.documentElement.appendChild(bar);
      show(); hide(2600);                      // 进页面时先亮 2.6 秒, 提示存在
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }catch(e){}
})();)SHIM";

// ---------------- 一次性存档迁移: file:// -> https://hall.local ----------------
// 旧大厅用 file:// 加载游戏, 四个破门而入页面的存档都躺在 file:// 这个 origin 下;
// 换虚拟主机后 origin 变成 https://hall.local, 直接读会"凭空清零"。
// 所以: 首次(标记文件不存在)时在 file:// 页面里读出旧档, 再写进新 origin, 最后落标记文件。
// 任何一步失败都只是跳过迁移, 绝不影响进大厅。
static std::wstring g_migrateMarker;
static std::wstring g_legacyJson = L"{}";
static int g_migrateState = 0;                 // 0=未开始 1=读旧档 2=写新档 3=完成
static const wchar_t* kMigrateKeys[] = {
    L"breach_game_cfg",  L"breach_game_save",  L"breach_game_set",   L"breach_game_slot",
    L"breach_game_cfg_s", L"breach_game_cfg_s2", L"breach_game_save_s", L"breach_game_save_s2",
    L"hall_prefs_v1"
};
static const int kMigrateKeyCount = (int)(sizeof(kMigrateKeys) / sizeof(kMigrateKeys[0]));
static std::wstring migrateReadScript() {
    std::wstring s = L"(function(){var o={};[";
    for (int i = 0; i < kMigrateKeyCount; i++) {
        if (i) s += L",";
        s += L"\"" + std::wstring(kMigrateKeys[i]) + L"\"";
    }
    s += L"].forEach(function(k){try{var v=localStorage.getItem(k);if(v!==null)o[k]=v;}catch(e){}});"
         L"return JSON.stringify(o);})()";
    return s;
}
static std::wstring migrateWriteScript() {
    return L"(function(){var legacy={};try{legacy=JSON.parse(" + jsonStr(g_legacyJson) + L");}catch(e){}"
           L"if(localStorage.getItem('hall_migrated_v1')!==null)return 'SKIP';"
           L"var n=0;for(var k in legacy){try{localStorage.setItem(k,legacy[k]);n++;}catch(e){}}"
           L"try{localStorage.setItem('hall_migrated_v1','1');}catch(e){}"
           L"return 'MIGRATED:'+n;})()";
}
// ExecuteScript 的返回值是 JSON 字面量(字符串带引号/转义), 这里还原成原文
static std::wstring jsonUnquote(const std::wstring& s) {
    std::string u = toUtf8(s);
    json::P p(u);
    std::wstring out = toWide(p.str());
    return out.empty() ? std::wstring(L"{}") : out;
}
static void writeMigrateMarker() {
    HANDLE h = CreateFileW(g_migrateMarker.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, NULL);
    if (h != INVALID_HANDLE_VALUE) CloseHandle(h);
}
static void startMigrate();
static void onMigrateNavDone(bool ok);

// ---------------- 自检与页面探针 ----------------
struct ProbeStep { std::wstring url; std::wstring script; std::wstring label; };
static std::vector<ProbeStep> g_probe;
static size_t g_probeIdx = 0;
static int g_probeFail = 0;
static bool g_selftest = false;
static bool g_probeAll = false;              // --probe-all: 逐个打开所有网页游戏
static std::wstring g_probePath;             // --probe <相对路径>: 只测这一个页面
static void startProbeAll();

// 在真 WebView2 里检查一个页面: 标题 / 正文长度 / canvas 尺寸 / JS 错误数 / 对话框数
static std::wstring pageDiagScript() {
    return L"(function(){var e=window.__hallErrors||[];var dl=window.__hallDialogs||[];"
           L"var cv=document.querySelectorAll('canvas');"
           L"var s=[];for(var i=0;i<cv.length&&i<4;i++)s.push((cv[i].id||'?')+':'+cv[i].width+'x'+cv[i].height);"
           L"var t=document.body?(document.body.innerText||'').replace(/\\s+/g,'').length:-1;"
           L"var msg='title='+(document.title||'')+' | text='+t+' | canvas=['+s.join(',')+'] | errors='+e.length;"
           L"if(e.length)msg+=' <- '+e.slice(0,2).join(' ;; ');"
           L"msg+=' | dialogs='+dl.length;"
           L"if(dl.length)msg+=' <- '+dl.slice(0,1).join('');"
           L"return msg;})()";
}

static void startProbe();
static void onProbeNavDone(bool ok);
static void finishProbe();

// ---------------- WebView2 ----------------
static void initWebView(HWND hwnd) {
    std::wstring profile = g_dir + L"_runtime\\profile";
    CreateCoreWebView2EnvironmentWithOptions(nullptr, profile.c_str(), nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [hwnd](HRESULT hr, ICoreWebView2Environment* env) -> HRESULT {
                if (FAILED(hr) || !env) {
                    if (g_selftest) {
                        printLine("PROBE FAIL: WebView2 环境创建失败 hr=" + hex32((unsigned)hr) + "\n");
                        g_probeFail++;
                        finishProbe();
                        return S_OK;
                    }
                    MessageBoxW(hwnd,
                        L"未检测到可用的 WebView2 Runtime, 大厅无法启动。\n\n"
                        L"本大厅是 32 位程序(32 位 / 64 位 Windows 都能运行), 但需要系统里装有\n"
                        L"「Microsoft Edge WebView2 Runtime」。Windows 10/11 一般已自带;\n"
                        L"缺少时请安装 Evergreen 运行时: 32 位系统装 x86 版, 64 位系统装 x64 版。\n\n"
                        L"Windows 7 / 8.1 只能用 109 及更早的固定版本运行时。",
                        L"游戏大厅", MB_ICONERROR | MB_OK);
                    g_exitCode = 2;
                    PostMessageW(hwnd, WM_CLOSE, 0, 0);
                    return S_OK;
                }
                if (g_selftest) printLine("PROBE 环境就绪\n");
                env->CreateCoreWebView2Controller(hwnd,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [hwnd](HRESULT hr2, ICoreWebView2Controller* ctl) -> HRESULT {
                            if (g_selftest) printLine("PROBE 控制器回调 hr=" + hex32((unsigned)hr2) + "\n");
                            if (FAILED(hr2) || !ctl) {
                                if (g_selftest) {
                                    printLine("PROBE FAIL: 控制器创建失败 hr=" + hex32((unsigned)hr2) + "\n");
                                    g_probeFail++;
                                    finishProbe();
                                    return S_OK;
                                }
                                g_exitCode = 3; PostMessageW(hwnd, WM_CLOSE, 0, 0); return S_OK;
                            }
                            g_ctl = ctl;
                            g_ctl->get_CoreWebView2(&g_web);
                            g_webviewOk = true;
                            KillTimer(hwnd, 2);          // 起来了, 撤掉白屏兜底
                            g_ctl->put_IsVisible(TRUE);

                            // --- 外观: 暗色底, 消除白闪 ---
                            ComPtr<ICoreWebView2Controller2> c2;
                            if (SUCCEEDED(g_ctl.As(&c2))) {
                                COREWEBVIEW2_COLOR bg = { 255, 6, 9, 16 };
                                c2->put_DefaultBackgroundColor(bg);
                            }
                            // --- 设置: 关掉浏览器快捷键(避免 F5/Ctrl+R 在战斗中刷新), 保留开发者工具 ---
                            ComPtr<ICoreWebView2Settings> st;
                            if (SUCCEEDED(g_web->get_Settings(&st)) && st) {
                                st->put_IsWebMessageEnabled(TRUE);
                                st->put_AreDevToolsEnabled(TRUE);
                                st->put_IsZoomControlEnabled(FALSE);
                                ComPtr<ICoreWebView2Settings3> st3;
                                if (SUCCEEDED(st.As(&st3))) st3->put_AreBrowserAcceleratorKeysEnabled(FALSE);
                            }

                            // --- 本地内容映射成 https://hall.local/ (同源 + secure context) ---
                            if (g_wantVHost) {
                                ComPtr<ICoreWebView2_3> w3;
                                if (SUCCEEDED(g_web.As(&w3))) {
                                    HRESULT mh = w3->SetVirtualHostNameToFolderMapping(
                                        L"hall.local", g_dir.c_str(),
                                        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW);
                                    g_vhostOk = SUCCEEDED(mh);
                                }
                            }
                            g_base = g_vhostOk ? std::wstring(L"https://hall.local/") : fileBaseOf(g_dir);
                            g_hallUrl = urlOf(L"_runtime/hall.html");
                            writeHallPage();

                            // --- 页面脚本注入 + 事件 ---
                            EventRegistrationToken tok;
                            // 探针/自检模式先打一个标记, shim 据此接管阻塞式对话框
                            if (g_probeAll || g_selftest)
                                g_web->AddScriptToExecuteOnDocumentCreated(L"window.__hallProbeMode=true;", nullptr);
                            g_web->AddScriptToExecuteOnDocumentCreated(kShimScript, nullptr);

                            g_web->add_WebMessageReceived(
                                Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                                    [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
                                        LPWSTR raw = nullptr;
                                        args->TryGetWebMessageAsString(&raw);
                                        std::wstring m = raw ? raw : L"";
                                        if (raw) CoTaskMemFree(raw);
                                        if (m == L"hall") { goHall(); return S_OK; }
                                        if (m == L"reload") { rescanAndReload(); return S_OK; }
                                        size_t c = m.find(L':');
                                        std::wstring head = (c == std::wstring::npos) ? m : m.substr(0, c);
                                        std::wstring rest = (c == std::wstring::npos) ? L"" : m.substr(c + 1);
                                        if (head == L"folder") { openFolder(rest); return S_OK; }
                                        if (head == L"web") {
                                            size_t c2 = rest.find(L':');
                                            std::wstring gid = (c2 == std::wstring::npos) ? rest : rest.substr(0, c2);
                                            std::wstring mid = (c2 == std::wstring::npos) ? L"" : rest.substr(c2 + 1);
                                            const Game* g = findGame(gid);
                                            if (g) {
                                                const Mode* mm = NULL;
                                                for (auto& x : g->modes) if (x.id == mid) mm = &x;
                                                actWeb(*g, mid.empty() ? NULL : mm);
                                            }
                                            return S_OK;
                                        }
                                        if (head == L"exe") {
                                            const Game* g = findGame(rest);
                                            if (g) actExe(*g);
                                            return S_OK;
                                        }
                                        return S_OK;
                                    }).Get(), &tok);

                            g_web->add_NavigationCompleted(
                                Callback<ICoreWebView2NavigationCompletedEventHandler>(
                                    [](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                                        BOOL ok = FALSE;
                                        args->get_IsSuccess(&ok);
                                        if (g_migrateState == 1 || g_migrateState == 2) {
                                            onMigrateNavDone(ok == TRUE);
                                            return S_OK;
                                        }
                                        if (g_selftest || g_probeAll) { onProbeNavDone(ok == TRUE); return S_OK; }
                                        if (!ok && g_inGame) {
                                            toast(L"bad", L"页面加载失败, 已返回大厅");
                                            goHall();
                                        }
                                        return S_OK;
                                    }).Get(), &tok);

                            g_web->add_DocumentTitleChanged(
                                Callback<ICoreWebView2DocumentTitleChangedEventHandler>(
                                    [](ICoreWebView2* sender, IUnknown*) -> HRESULT {
                                        if (g_selftest || g_probeAll) {   // 探针模式: 把页面标题打出来
                                            LPWSTR t = nullptr;
                                            sender->get_DocumentTitle(&t);
                                            if (t) { printLine("PROBE [标题] " + toUtf8(t) + "\n"); CoTaskMemFree(t); }
                                        }
                                        setTitle(); return S_OK;
                                    }).Get(), &tok);

                            // 绝不产生第二个 WebView2: 本地页面复用本实例, 外链丢给系统浏览器
                            g_web->add_NewWindowRequested(
                                Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                                    [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
                                        LPWSTR uri = nullptr;
                                        args->get_Uri(&uri);
                                        std::wstring u = uri ? uri : L"";
                                        if (uri) CoTaskMemFree(uri);
                                        bool local = (u.compare(0, g_base.size(), g_base) == 0) ||
                                                     (u.compare(0, 9, L"file:///") == 0);
                                        if (local) {
                                            // 让"新窗口"落回本实例 —— 全程只有一个 WebView2
                                            args->put_NewWindow(g_web.Get());
                                            args->put_Handled(TRUE);
                                        } else {
                                            args->put_Handled(TRUE);
                                            ShellExecuteW(NULL, L"open", u.c_str(), NULL, NULL, SW_SHOWNORMAL);
                                        }
                                        return S_OK;
                                    }).Get(), &tok);

                            g_ctl->add_AcceleratorKeyPressed(
                                Callback<ICoreWebView2AcceleratorKeyPressedEventHandler>(
                                    [hwnd](ICoreWebView2Controller*, ICoreWebView2AcceleratorKeyPressedEventArgs* args) -> HRESULT {
                                        COREWEBVIEW2_KEY_EVENT_KIND kind;
                                        args->get_KeyEventKind(&kind);
                                        if (kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN &&
                                            kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN) return S_OK;
                                        UINT vk = 0;
                                        args->get_VirtualKey(&vk);
                                        bool alt = (GetKeyState(VK_MENU) & 0x8000) != 0;
                                        if (vk == VK_F11) { args->put_Handled(TRUE); toggleFullscreen(); }
                                        else if (vk == VK_F1) { args->put_Handled(TRUE); goHall(); }
                                        else if (vk == VK_LEFT && alt) { args->put_Handled(TRUE); goHall(); }
                                        return S_OK;
                                    }).Get(), &tok);

                            RECT rc; GetClientRect(hwnd, &rc);
                            g_ctl->put_Bounds(rc);

                            if (g_vhostOk && GetFileAttributesW(g_migrateMarker.c_str()) == INVALID_FILE_ATTRIBUTES) {
                                startMigrate();          // 换 origin 了, 先把旧 file:// 存档搬过来
                            } else if (g_probeAll) startProbeAll();
                            else if (g_selftest) startProbe();
                            else { g_web->Navigate(g_hallUrl.c_str()); setTitle(); }
                            return S_OK;
                        }).Get());
                return S_OK;
            }).Get());
}

// ---------------- 自检实现 ----------------
static void finishProbe() {
    printLine("SELFTEST DONE: steps=" + std::to_string((int)g_probe.size()) +
              " fails=" + std::to_string(g_probeFail) + "\n");
    g_exitCode = g_probeFail ? 1 : 0;
    if (g_hwnd) PostMessageW(g_hwnd, WM_CLOSE, 0, 0);
}
static void onProbeNavDone(bool ok) {
    if (g_probeIdx >= g_probe.size()) { finishProbe(); return; }
    if (!ok) {
        printLine("PROBE FAIL: " + toUtf8(g_probe[g_probeIdx].label) + " -> 导航失败\n");
        g_probeFail++;
        finishProbe();
        return;
    }
    size_t idx = g_probeIdx;
    printLine("PROBE 导航完成 -> " + toUtf8(g_probe[idx].label) + "\n");
    g_web->ExecuteScript(g_probe[idx].script.c_str(),
        Callback<ICoreWebView2ExecuteScriptCompletedHandler>(
            [idx](HRESULT hr, LPCWSTR result) -> HRESULT {
                std::wstring r = (SUCCEEDED(hr) && result) ? result : L"(无返回值)";
                printLine("PROBE " + toUtf8(g_probe[idx].label) + ": " + toUtf8(r) + "\n");
                if (g_probeAll && toUtf8(r).find("errors=0") == std::string::npos) g_probeFail++;
                g_probeIdx++;
                if (g_probeIdx < g_probe.size()) g_web->Navigate(g_probe[g_probeIdx].url.c_str());
                else finishProbe();
                return S_OK;
            }).Get());
}
// --probe-all: 按清单逐个打开所有网页游戏(含 modes 子页面), 在真 WebView2 里报
// 标题/正文长度/canvas 尺寸/JS 错误数 —— 这是"每个游戏到底打不打得开"的最终证据。
static void startProbeAll() {
    g_probe.clear();
    if (!g_probePath.empty()) {
        g_probe.push_back({ urlOf(g_probePath), pageDiagScript(), g_probePath });
    } else {
        for (auto& g : g_hall.games) {
            if (g.kind != L"web" || !g.exists) continue;
            g_probe.push_back({ urlOf(g.path), pageDiagScript(), g.name });
            for (auto& m : g.modes) {
                if (m.path == g.path || !m.exists) continue;
                g_probe.push_back({ urlOf(m.path), pageDiagScript(), g.name + L" · " + m.name });
            }
        }
    }
    g_probeIdx = 0;
    if (g_probe.empty()) { printLine("PROBE-ALL: 没有可测的网页游戏\n"); finishProbe(); return; }
    printLine("PROBE-ALL 共 " + std::to_string((int)g_probe.size()) + " 个页面, base=" + toUtf8(g_base) + "\n");
    g_web->Navigate(g_probe[0].url.c_str());
}
static void startProbe() {
    g_probe.clear();
    g_probe.push_back({ urlOf(L"game/breach/index.html"),
        L"(function(){try{localStorage.setItem('__hall_probe','42');"
        L"return 'SET-OK origin='+location.origin+' proto='+location.protocol;}"
        L"catch(e){return 'SET-FAIL '+e.message;}})()", L"1/3 主页 localStorage 写入" });
    g_probe.push_back({ urlOf(L"game/breach/game/hub.html"),
        L"(function(){try{var v=localStorage.getItem('__hall_probe');"
        L"return (v==='42'?'SHARED-OK':'NOT-SHARED('+v+')')+' origin='+location.origin;}"
        L"catch(e){return 'GET-FAIL '+e.message;}})()", L"2/3 整备页 读取(同源?)" });
    g_probe.push_back({ g_hallUrl,
        L"(function(){try{localStorage.removeItem('__hall_probe');}catch(e){}"
        L"var cards=document.querySelectorAll('#grid .card').length;"
        L"var nav=document.querySelectorAll('#nav button').length;"
        L"var root=document.querySelector('.card.hero h2');"
        L"var modes=document.querySelectorAll('.card.hero .modes button').length;"
        L"var cnt=document.getElementById('crumbCount');"
        L"var sv=null;try{sv=localStorage.getItem('breach_game_save');}catch(e){}"
        L"return 'CARDS='+cards+' NAV='+nav+' HERO='+(root?root.textContent:'?')+"
        L"' MODES='+modes+' COUNT='+(cnt?cnt.textContent:'?')+' SAVE='+(sv?'yes('+sv.length+')':'no');})()",
        L"3/3 大厅页 渲染" });
    g_probeIdx = 0;
    printLine("PROBE base=" + toUtf8(g_base) + "\n");
    g_web->Navigate(g_probe[0].url.c_str());
}

// ---------------- 迁移流程 ----------------
static void migrateFallthrough() {
    g_migrateState = 3;
    if (g_hwnd) KillTimer(g_hwnd, 3);
    if (g_probeAll) startProbeAll();
    else if (g_selftest) startProbe();
    else { g_web->Navigate(g_hallUrl.c_str()); setTitle(); }
}
static void startMigrate() {
    g_migrateState = 1;
    if (g_selftest) printLine("MIGRATE 读取旧 file:// 存档\n");
    if (g_hwnd) SetTimer(g_hwnd, 3, 8000, NULL);   // 8 秒兜底: 迁移卡住也必须进大厅
    // 读旧档不需要是游戏页 —— file:// 下所有本地页面共用一份 localStorage。
    // 这里特意读大厅页本身, 让一次性迁移在视觉上"大厅 -> 大厅", 不闪游戏画面。
    g_web->Navigate(fileUrlOf(L"_runtime/hall.html").c_str());
}
static void onMigrateNavDone(bool ok) {
    if (!ok) {                         // 读不到旧档就放弃迁移, 绝不挡路
        if (g_selftest) printLine("MIGRATE 跳过: 旧档页面打不开\n");
        writeMigrateMarker();
        migrateFallthrough();
        return;
    }
    if (g_migrateState == 1) {
        g_web->ExecuteScript(migrateReadScript().c_str(),
            Callback<ICoreWebView2ExecuteScriptCompletedHandler>(
                [](HRESULT hr, LPCWSTR result) -> HRESULT {
                    if (g_migrateState != 1) return S_OK;      // 已被兜底放弃
                    g_legacyJson = (SUCCEEDED(hr) && result) ? jsonUnquote(result) : L"{}";
                    if (g_selftest) printLine("MIGRATE 读到旧档: " + toUtf8(g_legacyJson) + "\n");
                    g_migrateState = 2;
                    g_web->Navigate(g_hallUrl.c_str());   // 切到新 origin 再写
                    return S_OK;
                }).Get());
        return;
    }
    g_web->ExecuteScript(migrateWriteScript().c_str(),
        Callback<ICoreWebView2ExecuteScriptCompletedHandler>(
            [](HRESULT hr, LPCWSTR result) -> HRESULT {
                if (g_migrateState != 2) return S_OK;
                std::wstring r = (SUCCEEDED(hr) && result) ? result : L"(失败)";
                writeMigrateMarker();
                if (g_selftest) printLine("MIGRATE 结果: " + toUtf8(r) + "\n");
                migrateFallthrough();
                return S_OK;
            }).Get());
}

// ---------------- 窗口 ----------------
static void layout(HWND hwnd) {
    if (!g_ctl) return;
    RECT rc; GetClientRect(hwnd, &rc);
    g_ctl->put_Bounds(rc);            // 整个客户区 = 唯一的 WebView2, 没有别的控件
}
static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_CREATE: g_hwnd = hwnd; return 0;
    case WM_SIZE: layout(hwnd); return 0;
    case WM_TIMER:
        if (wp == 1 && (g_selftest || g_probeAll)) {   // 自检/探针看门狗: 卡住也要留日志并以失败退出
            printLine("PROBE FAIL: 超时未完成\n");
            g_probeFail++;
            KillTimer(hwnd, 1);
            finishProbe();
        } else if (wp == 3 && (g_migrateState == 1 || g_migrateState == 2)) {
            printLine("MIGRATE 超时, 放弃迁移直接进大厅\n");   // 只可能发生在没有 stdout 时静默
            migrateFallthrough();
        } else if (wp == 2 && !g_webviewOk) {
            // 兜底: WebView2 迟迟起不来(缺 Runtime / 环境受限)也绝不白屏, 给出明确原因
            KillTimer(hwnd, 2);
            MessageBoxW(hwnd,
                        L"WebView2 初始化超时, 大厅无法启动。\n\n"
                        L"请确认系统已安装 Microsoft Edge WebView2 Runtime"
                        L"(32 位系统装 x86 版)。\n"
                        L"若已安装仍报此错, 可能是安全软件拦截了 msedgewebview2.exe。",
                        L"游戏大厅", MB_ICONERROR | MB_OK);
            g_exitCode = 4;
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
        }
        return 0;
    case WM_GETMINMAXINFO: {
        MINMAXINFO* mm = (MINMAXINFO*)lp;
        mm->ptMinTrackSize.x = 900; mm->ptMinTrackSize.y = 620;
        return 0;
    }
    case WM_DESTROY: PostQuitMessage(0); return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

// ---------------- 32 位 / 老系统兼容 ----------------
// 大厅默认编成 32 位(x86): 32 位 Windows 原生跑, 64 位 Windows 走 WOW64 跑, 一套产物覆盖两种系统。
// WebView2 的浏览器进程仍按系统架构起(64 位系统上就是 64 位 msedgewebview2.exe), 大厅宿主只是
// 负责开窗口与导航的薄壳, 所以不受 32 位地址空间的限制。
//
// SetProcessDpiAwarenessContext 是 Windows 10 1703 才有的导出; 静态导入它会让更老的系统在
// **加载器**阶段就报"找不到入口点", 连"缺 WebView2 Runtime"的提示都弹不出来。这里改成运行时
// 按需取地址: 有就用 Per-Monitor V2, 没有就退回 Vista 起的 SetProcessDPIAware()。
static void enableDpiAwareness() {
    typedef BOOL (WINAPI* SetDpiCtxFn)(DPI_AWARENESS_CONTEXT);
    HMODULE user32 = GetModuleHandleW(L"user32.dll");
    SetDpiCtxFn fn = user32 ? (SetDpiCtxFn)GetProcAddress(user32, "SetProcessDpiAwarenessContext") : NULL;
    if (fn && fn(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) return;
    SetProcessDPIAware();
}
static const wchar_t* archTag() {
#ifdef _WIN64
    return L"x64";
#else
    return L"x86";
#endif
}

// ---------------- 入口 ----------------
int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, LPWSTR, int) {
    enableDpiAwareness();
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    wchar_t mod[MAX_PATH];
    GetModuleFileNameW(NULL, mod, MAX_PATH);
    g_dir = mod;
    size_t s = g_dir.find_last_of(L'\\');
    g_dir = (s == std::wstring::npos) ? L"" : g_dir.substr(0, s + 1);
    SetCurrentDirectoryW(g_dir.c_str());
    g_manifest = g_dir + L"games.json";
    g_hallFile = g_dir + L"_runtime\\hall.html";
    g_migrateMarker = g_dir + L"_runtime\\profile\\hall_origin_migrated_v1";

    bool exportOnly = false;
    {
        int argc = 0;
        LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
        for (int i = 1; i < argc; i++) {
            if (wcscmp(argv[i], L"--export") == 0) exportOnly = true;
            else if (wcscmp(argv[i], L"--selftest") == 0) g_selftest = true;
            else if (wcscmp(argv[i], L"--probe-all") == 0) g_probeAll = true;
            else if (wcscmp(argv[i], L"--probe") == 0 && i + 1 < argc) { g_probeAll = true; g_probePath = argv[++i]; }
            else if (wcscmp(argv[i], L"--vhost") == 0) g_wantVHost = true;
            else if (wcscmp(argv[i], L"--file") == 0) g_wantVHost = false;
        }
        if (argv) LocalFree(argv);
    }

    Hall h;
    if (loadManifest(g_manifest, h)) g_hall = h;
    else fallbackHall(g_hall);
    refreshExists();

    // --export: 只生成 _runtime\hall.html(不弹窗)后退出, 供测试/排查使用
    if (exportOnly) {
        g_vhostOk = false;
        g_base = fileBaseOf(g_dir);
        g_hallUrl = urlOf(L"_runtime/hall.html");
        writeHallPage();
        int n = 0, modes = 0;
        for (auto& g : g_hall.games) { if (g.exists) n++; modes += (int)g.modes.size(); }
        printLine("EXPORT OK: " + toUtf8(g_hallFile) + " | games=" + std::to_string((int)g_hall.games.size()) +
                  " available=" + std::to_string(n) + " modes=" + std::to_string(modes) + "\n");
        return 0;
    }

    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hIcon = LoadIconW(NULL, IDI_APPLICATION);
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = CreateSolidBrush(RGB(6, 9, 16));
    wc.lpszClassName = L"GameHallSingleWebView2";

    RegisterClassExW(&wc);
    HWND hwnd = CreateWindowExW(0, wc.lpszClassName, L"游戏大厅",
        WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 1220, 840, NULL, NULL, hInst, NULL);
    if (!hwnd) return 1;
    ShowWindow(hwnd, SW_SHOW);
    UpdateWindow(hwnd);

    if (g_selftest) {
        printLine("SELFTEST START dir=" + toUtf8(g_dir) + " vhost=" +
                  (g_wantVHost ? "on" : "off") + " arch=" + toUtf8(archTag()) + "\n");
    }
    initWebView(hwnd);
    if (g_selftest) SetTimer(hwnd, 1, 60000, NULL);
    else if (g_probeAll) SetTimer(hwnd, 1, 180000, NULL);   // 9 个页面, 给足时间
    else SetTimer(hwnd, 2, 40000, NULL);

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    return g_exitCode;
}
