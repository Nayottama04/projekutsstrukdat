// util.hpp - fungsi bantu: hash password (PBKDF2-HMAC-SHA256), token acak, string, config, file.
#pragma once
#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <map>
#include <random>
#include <sstream>
#include <string>
#include <vector>

namespace util {

// ---------- SHA-256 ----------
inline std::string sha256(const std::string& data) {
    static const uint32_t K[64] = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
    uint32_t h[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                     0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    std::string msg = data;
    msg.push_back(static_cast<char>(0x80));
    while (msg.size() % 64 != 56) msg.push_back('\0');
    uint64_t bits = static_cast<uint64_t>(data.size()) * 8ULL;
    for (int i = 7; i >= 0; --i) msg.push_back(static_cast<char>((bits >> (i * 8)) & 0xff));
    auto rotr = [](uint32_t x, int n) { return (x >> n) | (x << (32 - n)); };
    for (size_t off = 0; off < msg.size(); off += 64) {
        uint32_t w[64];
        for (int i = 0; i < 16; ++i) {
            const unsigned char* p = reinterpret_cast<const unsigned char*>(msg.data()) + off + i * 4;
            w[i] = (uint32_t(p[0]) << 24) | (uint32_t(p[1]) << 16) | (uint32_t(p[2]) << 8) | uint32_t(p[3]);
        }
        for (int i = 16; i < 64; ++i) {
            uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; ++i) {
            uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            uint32_t ch = (e & f) ^ (~e & g);
            uint32_t t1 = hh + S1 + ch + K[i] + w[i];
            uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            uint32_t mj = (a & b) ^ (a & c) ^ (b & c);
            uint32_t t2 = S0 + mj;
            hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    std::string out(32, '\0');
    for (int i = 0; i < 8; ++i)
        for (int j = 0; j < 4; ++j) out[i * 4 + j] = static_cast<char>((h[i] >> (24 - j * 8)) & 0xff);
    return out;
}

inline std::string hmacSha256(const std::string& key, const std::string& msg) {
    std::string k = key;
    if (k.size() > 64) k = sha256(k);
    k.resize(64, '\0');
    std::string ipad(64, '\0'), opad(64, '\0');
    for (int i = 0; i < 64; ++i) {
        ipad[i] = static_cast<char>(k[i] ^ 0x36);
        opad[i] = static_cast<char>(k[i] ^ 0x5c);
    }
    return sha256(opad + sha256(ipad + msg));
}

inline std::string pbkdf2(const std::string& password, const std::string& salt, int iterations) {
    // satu blok (32 byte) sudah cukup untuk panjang kunci 256 bit
    std::string u = hmacSha256(password, salt + std::string("\0\0\0\1", 4));
    std::string t = u;
    for (int i = 1; i < iterations; ++i) {
        u = hmacSha256(password, u);
        for (size_t j = 0; j < t.size(); ++j) t[j] = static_cast<char>(t[j] ^ u[j]);
    }
    return t;
}

inline std::string toHex(const std::string& raw) {
    static const char* d = "0123456789abcdef";
    std::string out;
    out.reserve(raw.size() * 2);
    for (unsigned char c : raw) { out.push_back(d[c >> 4]); out.push_back(d[c & 15]); }
    return out;
}

// ---------- acak ----------
inline std::mt19937_64& rng() {
    // random_device dicampur dengan waktu agar tetap bervariasi di compiler lama (MinGW)
    static std::mt19937_64 gen([] {
        std::random_device rd;
        uint64_t seed = (static_cast<uint64_t>(rd()) << 32) ^ rd();
        seed ^= static_cast<uint64_t>(std::chrono::high_resolution_clock::now().time_since_epoch().count());
        return seed;
    }());
    return gen;
}

inline std::string randomHex(size_t bytes) {
    std::string raw(bytes, '\0');
    for (size_t i = 0; i < bytes; ++i) raw[i] = static_cast<char>(rng()() & 0xff);
    return toHex(raw);
}

inline long long randomDigits(int n) {
    long long v = 0;
    for (int i = 0; i < n; ++i) v = v * 10 + static_cast<long long>(rng()() % 10);
    return v;
}

// ---------- password ----------
constexpr int kPbkdf2Iterations = 20000;

inline std::string hashPassword(const std::string& password) {
    std::string salt = randomHex(16);
    return "pbkdf2$" + std::to_string(kPbkdf2Iterations) + "$" + salt + "$" +
           toHex(pbkdf2(password, salt, kPbkdf2Iterations));
}

inline bool verifyPassword(const std::string& password, const std::string& stored) {
    std::vector<std::string> parts;
    std::stringstream ss(stored);
    std::string part;
    while (std::getline(ss, part, '$')) parts.push_back(part);
    if (parts.size() != 4 || parts[0] != "pbkdf2") return false;
    int iters = std::atoi(parts[1].c_str());
    if (iters <= 0 || iters > 1000000) return false;
    const std::string& expected = parts[3];
    std::string actual = toHex(pbkdf2(password, parts[2], iters));
    if (expected.size() != actual.size()) return false;
    unsigned char diff = 0;  // pembandingan waktu-konstan
    for (size_t i = 0; i < expected.size(); ++i) diff |= static_cast<unsigned char>(expected[i] ^ actual[i]);
    return diff == 0;
}

// ---------- string ----------
inline std::string lower(std::string s) {
    for (char& c : s) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    return s;
}

inline std::string trim(const std::string& s) {
    size_t a = 0, b = s.size();
    while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
    while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
    return s.substr(a, b - a);
}

inline bool containsCI(const std::string& hay, const std::string& needle) {
    if (needle.empty()) return true;
    return lower(hay).find(lower(needle)) != std::string::npos;
}

inline std::string slugify(const std::string& s) {
    std::string out;
    bool dash = false;
    for (char c : lower(s)) {
        if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) { out.push_back(c); dash = false; }
        else if (!dash && !out.empty()) { out.push_back('-'); dash = true; }
    }
    while (!out.empty() && out.back() == '-') out.pop_back();
    return out;
}

inline bool allDigits(const std::string& s) {
    if (s.empty()) return false;
    for (char c : s) if (c < '0' || c > '9') return false;
    return true;
}

// ---------- file & config ----------
inline bool readFile(const std::string& path, std::string& out) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    std::ostringstream ss;
    ss << f.rdbuf();
    out = ss.str();
    return true;
}

inline std::map<std::string, std::string> loadConfig(const std::string& path) {
    std::map<std::string, std::string> cfg;
    std::ifstream f(path);
    std::string line;
    while (std::getline(f, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;
        size_t eq = line.find('=');
        if (eq == std::string::npos) continue;
        cfg[trim(line.substr(0, eq))] = trim(line.substr(eq + 1));
    }
    return cfg;
}

inline std::string cfgGet(const std::map<std::string, std::string>& c, const std::string& k, const std::string& def) {
    auto it = c.find(k);
    return it == c.end() ? def : it->second;
}

inline std::string mimeType(const std::string& path) {
    size_t dot = path.rfind('.');
    std::string ext = dot == std::string::npos ? "" : lower(path.substr(dot + 1));
    if (ext == "html") return "text/html; charset=utf-8";
    if (ext == "css") return "text/css; charset=utf-8";
    if (ext == "js") return "application/javascript; charset=utf-8";
    if (ext == "json") return "application/json; charset=utf-8";
    if (ext == "svg") return "image/svg+xml";
    if (ext == "png") return "image/png";
    if (ext == "jpg" || ext == "jpeg") return "image/jpeg";
    if (ext == "webp") return "image/webp";
    if (ext == "ico") return "image/x-icon";
    if (ext == "woff2") return "font/woff2";
    return "application/octet-stream";
}

}  // namespace util
