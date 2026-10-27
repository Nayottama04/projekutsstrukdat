
 // RaceParts - backend C++ (Crow + MySQL Connector/C++)
 // Menjalankan: API di /api/, dan menyajikan frontend statis dari folder "frontend".

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#endif

#include <iostream>
#include <string>

#include "app.hpp"

// Hapus macro Windows setelah app.hpp dimuat,
// karena header tersebut mungkin memuat header Windows.
#ifdef POST
#undef POST
#endif

#ifdef PUT
#undef PUT
#endif

#ifdef DELETE
#undef DELETE
#endif

#include "routes_public.hpp"
#include "routes_seller.hpp"
#include "routes_shop.hpp"


// Gabungkan root dan path relatif dengan aman (tolak ".." dan karakter berbahaya)
static bool safeJoin(const std::string& root, std::string rel, std::string& out) {
    if (rel.empty() || rel == "/") rel = "/index.html";
    if (rel[0] != '/') return false;
    if (rel.find("..") != std::string::npos || rel.find('\\') != std::string::npos || rel.find('\0') != std::string::npos) return false;
    out = root + rel;
    return true;
}

int main(int argc, char** argv) {
    std::string configPath = "config/app.conf";
    for (int i = 1; i < argc; ++i) {
        std::string a = argv[i];
        if (a == "--selftest") return runAlgorithmSelfTest();
        if (a == "--hash" && i + 1 < argc) {
            std::cout << util::hashPassword(argv[i + 1]) << std::endl;
            return 0;
        }
        if (a == "--config" && i + 1 < argc) configPath = argv[++i];
    }

    auto cfg = util::loadConfig(configPath);
    if (cfg.empty()) std::cerr << "[PERINGATAN] " << configPath << " tidak ditemukan/kosong, memakai nilai bawaan. Jalankan dari folder utama proyek." << std::endl;

    Db::Settings ds;
    ds.host = util::cfgGet(cfg, "db_host", "127.0.0.1");
    ds.port = std::atoi(util::cfgGet(cfg, "db_port", "3306").c_str());
    ds.user = util::cfgGet(cfg, "db_user", "root");
    ds.pass = util::cfgGet(cfg, "db_pass", "");
    ds.name = util::cfgGet(cfg, "db_name", "raceparts_db");
    int port = std::atoi(util::cfgGet(cfg, "server_port", "8080").c_str());
    std::string bindAddr = util::cfgGet(cfg, "bind_address", "127.0.0.1");

    AppState st(ds);
    st.frontendDir = util::cfgGet(cfg, "frontend_dir", "frontend");
    st.sessionHours = std::max(1, std::atoi(util::cfgGet(cfg, "session_hours", "12").c_str()));
    st.cfg = cfg;

    try {
        st.db.connect();
        std::cout << "[OK] Terhubung ke MySQL " << ds.host << ":" << ds.port << " (database " << ds.name << ")" << std::endl;
    } catch (const sql::SQLException& e) {
        std::cerr << "[PERINGATAN] Belum bisa terhubung ke MySQL (" << e.what() << ").\n"
                  << "  - Pastikan MySQL di XAMPP sudah Start\n"
                  << "  - Pastikan database '" << ds.name << "' sudah diimpor dari database/raceparts_db.sql\n"
                  << "  - Cek db_user/db_pass di " << configPath << "\n"
                  << "  Server tetap berjalan; API akan menampilkan pesan error sampai database siap." << std::endl;
    }

    crow::SimpleApp app;
    app.loglevel(crow::LogLevel::Warning);
    registerPublicRoutes(app, st);
    registerShopRoutes(app, st);
    registerSellerRoutes(app, st);

    // Frontend statis: "/" dan "/<path>" (rute biasa agar pola respons sama dengan endpoint API)
    auto serveStatic = [&st](const std::string& url) -> crow::response {
        if (url.compare(0, 4, "api/") == 0 || url == "api") return errorResponse(404, "Endpoint tidak ditemukan");
        std::string path, content;
        const std::string rel = "/" + url;
        bool found = safeJoin(st.frontendDir, rel, path) && util::readFile(path, content);
        if (!found && url.find('.') == std::string::npos && util::readFile(st.frontendDir + "/index.html", content)) {
            path = st.frontendDir + "/index.html";  // rute tanpa ekstensi dikembalikan ke index.html
            found = true;
        }
        if (!found) {
            crow::response r(404);
            r.set_header("Content-Type", "text/plain; charset=utf-8");
            r.body = "404 - Halaman tidak ditemukan";
            return r;
        }
        crow::response r(200);
        r.set_header("Content-Type", util::mimeType(path));
        r.set_header("Cache-Control", "no-cache");
        r.body = content;
        return r;
    };
    CROW_ROUTE(app, "/")([serveStatic]() { return serveStatic(""); });
    CROW_ROUTE(app, "/<path>")([serveStatic](const std::string& url) { return serveStatic(url); });
    CROW_CATCHALL_ROUTE(app)([](const crow::request&, crow::response& res) {
        res = errorResponse(404, "Tidak ditemukan");
        res.end();
    });

    std::cout << "RaceParts berjalan di http://" << (bindAddr == "0.0.0.0" ? "localhost" : bindAddr) << ":" << port
              << "  (tekan Ctrl+C untuk berhenti)" << std::endl;
    app.bindaddr(bindAddr).port(static_cast<uint16_t>(port)).multithreaded().run();
    return 0;
}
