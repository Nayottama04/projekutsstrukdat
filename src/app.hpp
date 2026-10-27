// app.hpp - state aplikasi, sesi login, otorisasi, helper JSON, dan penanganan error terpusat.
#pragma once
#include <chrono>
#include <cstdint>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#include "crow_all.h"

#include "algo.hpp"
#include "db.hpp"
#include "util.hpp"

using json = crow::json::wvalue;
using rjson = crow::json::rvalue;

struct User {
    long long id = 0;
    std::string name, username, role;
};

struct Session {
    User user;
    std::chrono::steady_clock::time_point expires;
};

struct AppState {
    Db db;
    std::mutex mu;  // satu request database pada satu waktu (aplikasi lokal), menjaga konsistensi stok
    std::map<std::string, Session> sessions;
    std::map<std::string, std::string> cfg;
    std::string frontendDir = "frontend";
    int sessionHours = 12;
    explicit AppState(Db::Settings s) : db(std::move(s)) {}
};

enum class Auth { None, Customer, Seller };

struct HttpError {
    int code;
    std::string message;
};

[[noreturn]] inline void fail(int code, const std::string& message) { throw HttpError{code, message}; }

// ---------- helper JSON keluar ----------
inline json jnum(long long v) { return json(static_cast<std::int64_t>(v)); }
inline json jstr(const std::string& s) { return json(s); }
inline json jnull() { return json(nullptr); }
inline json jobj() { return json::empty_object(); }

inline json cellJson(const Cell& c) {
    if (c.null) return jnull();
    if (c.num) {
        if (c.s.find('.') != std::string::npos) return json(std::atof(c.s.c_str()));
        return jnum(std::atoll(c.s.c_str()));
    }
    return json(c.s);
}

inline json rowJson(const Table& t, size_t r) {
    json o = jobj();
    for (size_t c = 0; c < t.cols.size(); ++c) o[t.cols[c]] = cellJson(t.rows[r][c]);
    return o;
}

inline json tableJson(const Table& t) {
    json::list items;
    for (size_t r = 0; r < t.size(); ++r) items.push_back(rowJson(t, r));
    return json(items);
}

inline json emptyList() { return json(json::list()); }

// ---------- helper JSON masuk (aman terhadap tipe yang salah) ----------
inline bool jHas(const rjson& b, const char* k) { return b.t() == crow::json::type::Object && b.has(k); }

inline std::string jStr(const rjson& b, const char* k, const std::string& def = "") {
    if (!jHas(b, k)) return def;
    const rjson& v = b[k];
    if (v.t() == crow::json::type::String) return std::string(v.s());
    if (v.t() == crow::json::type::Number) return std::to_string(static_cast<long long>(v.d()));
    return def;
}

inline long long jInt(const rjson& b, const char* k, long long def = 0) {
    if (!jHas(b, k)) return def;
    const rjson& v = b[k];
    if (v.t() == crow::json::type::Number) return static_cast<long long>(v.d());
    if (v.t() == crow::json::type::String) {
        std::string s = std::string(v.s());
        if (!s.empty() && (util::allDigits(s) || (s[0] == '-' && util::allDigits(s.substr(1))))) return std::atoll(s.c_str());
    }
    return def;
}

inline bool jBool(const rjson& b, const char* k, bool def = false) {
    if (!jHas(b, k)) return def;
    const rjson& v = b[k];
    if (v.t() == crow::json::type::True) return true;
    if (v.t() == crow::json::type::False) return false;
    if (v.t() == crow::json::type::Number) return v.d() != 0;
    return def;
}

inline bool jIsList(const rjson& b, const char* k) { return jHas(b, k) && b[k].t() == crow::json::type::List; }

// ---------- konteks request ----------
struct Ctx {
    const crow::request& req;
    AppState& st;
    Db& db;
    User user;
    bool authed = false;
    int status = 200;
    std::string token;

    Ctx(const crow::request& r, AppState& s) : req(r), st(s), db(s.db) {}

    const rjson& body() {
        if (!parsed_) {
            parsed_ = true;
            body_ = crow::json::load(req.body);
            if (!body_) fail(400, "Isi permintaan bukan JSON yang valid");
        }
        return body_;
    }

    std::string query(const char* name, const std::string& def = "") const {
        const char* v = req.url_params.get(name);
        return v == nullptr ? def : std::string(v);
    }

    long long queryInt(const char* name, long long def = 0) const {
        std::string v = query(name);
        if (v.empty()) return def;
        bool neg = v[0] == '-';
        if (!util::allDigits(neg ? v.substr(1) : v)) return def;
        return std::atoll(v.c_str());
    }

    // validasi string wajib dengan panjang minimum/maksimum
    std::string needStr(const char* key, const char* label, size_t minLen, size_t maxLen) {
        std::string v = util::trim(jStr(body(), key));
        if (v.size() < minLen) fail(400, std::string(label) + " wajib diisi" + (minLen > 1 ? " (minimal " + std::to_string(minLen) + " karakter)" : ""));
        if (v.size() > maxLen) fail(400, std::string(label) + " terlalu panjang (maksimal " + std::to_string(maxLen) + " karakter)");
        return v;
    }

private:
    bool parsed_ = false;
    rjson body_;
};

// ---------- sesi ----------
inline std::string bearerToken(const crow::request& req) {
    std::string h = req.get_header_value("Authorization");
    const std::string prefix = "Bearer ";
    if (h.compare(0, prefix.size(), prefix) == 0) return h.substr(prefix.size());
    return "";
}

inline std::string createSession(AppState& st, const User& u) {
    std::string token = util::randomHex(32);
    st.sessions[token] = Session{u, std::chrono::steady_clock::now() + std::chrono::hours(st.sessionHours)};
    return token;
}

inline void authenticate(Ctx& c, Auth level) {
    auto now = std::chrono::steady_clock::now();
    for (auto it = c.st.sessions.begin(); it != c.st.sessions.end();) {
        if (it->second.expires < now) it = c.st.sessions.erase(it);
        else ++it;
    }
    c.token = bearerToken(c.req);
    auto it = c.st.sessions.find(c.token);
    if (!c.token.empty() && it != c.st.sessions.end()) {
        c.user = it->second.user;
        c.authed = true;
    }
    if (level != Auth::None && !c.authed) fail(401, "Silakan masuk terlebih dahulu");
    if (level == Auth::Seller && c.user.role != "seller") fail(403, "Akses ini khusus untuk penjual");
}

// ---------- respons ----------
inline crow::response errorResponse(int code, const std::string& message) {
    json o = jobj();
    o["error"] = message;
    crow::response r(code);
    r.set_header("Content-Type", "application/json; charset=utf-8");
    r.body = o.dump();
    return r;
}

// Menjalankan handler dengan: kunci database, autentikasi, dan penanganan semua jenis error.
inline crow::response run(AppState& st, const crow::request& req, Auth level, const std::function<json(Ctx&)>& fn) {
    std::lock_guard<std::mutex> lock(st.mu);
    try {
        Ctx ctx(req, st);
        authenticate(ctx, level);
        json out = fn(ctx);
        crow::response r(ctx.status);
        r.set_header("Content-Type", "application/json; charset=utf-8");
        r.set_header("Cache-Control", "no-store");
        r.body = out.dump();
        return r;
    } catch (const HttpError& e) {
        return errorResponse(e.code, e.message);
    } catch (const sql::SQLException& e) {
        int c = e.getErrorCode();
        if (c == 1062) return errorResponse(409, "Data tersebut sudah ada");
        if (c == 1451 || c == 1452) return errorResponse(409, "Data masih terkait dengan data lain sehingga tidak dapat diubah atau dihapus");
        if (c == 2002 || c == 2003 || c == 2006 || c == 2013 || c == 1045 || c == 1049 || c == 1044)
            return errorResponse(503, "Tidak dapat terhubung ke database MySQL. Pastikan MySQL di XAMPP sudah Start dan database raceparts_db sudah diimpor.");
        std::cerr << "[SQL ERROR " << c << "] " << e.what() << std::endl;
        return errorResponse(500, "Terjadi kesalahan pada database");
    } catch (const std::exception& e) {
        std::cerr << "[ERROR] " << e.what() << std::endl;
        return errorResponse(500, "Terjadi kesalahan pada server");
    }
}

// ---------- konstanta bisnis ----------
inline const std::vector<std::string>& orderStatuses() {
    static const std::vector<std::string> s = {"Menunggu Pembayaran", "Dibayar", "Diproses", "Diserahkan ke Kurir",
                                               "Dalam Pengiriman", "Diterima", "Selesai"};
    return s;
}

inline int statusIndex(const std::string& s) {
    const auto& v = orderStatuses();
    for (size_t i = 0; i < v.size(); ++i) if (v[i] == s) return static_cast<int>(i);
    return -1;
}

inline const std::vector<std::string>& simulatedBanks() {
    static const std::vector<std::string> b = {"BCA", "BNI", "BRI", "Mandiri"};
    return b;
}

constexpr int kPaymentExpiryMinutes = 15;
