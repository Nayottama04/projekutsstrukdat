// algo.hpp - inti persyaratan tugas C++: Array, Pointer, Struct, Sorting (Bubble Sort), Searching (Linear Search)
// Seluruh log dibuat oleh proses algoritma yang benar-benar berjalan (bukan teks statis).
#pragma once
#include <cstdio>
#include <ctime>
#include <string>
#include <utility>
#include <vector>

#include "util.hpp"

// ---------- STRUCT ----------
struct Product {
    int id = 0;
    std::string name;
    std::string brand;
    std::string category;
    std::string image;
    long long price = 0;  // harga varian termurah (Rupiah)
    int stock = 0;        // total stok semua varian
    int sold = 0;
    double rating = 0.0;
    int ratingCount = 0;
    long long createdTs = 0;  // detik sejak epoch
};

// ---------- ARRAY ----------
// Kapasitas tetap untuk array katalog. Array dipakai oleh handler katalog (lihat routes_public.hpp).
constexpr int MAX_PRODUCTS = 512;
constexpr size_t MAX_LOG_LINES = 5000;

enum class SortKey { Name, PriceAsc, PriceDesc, Newest };

inline SortKey parseSortKey(const std::string& s) {
    if (s == "name") return SortKey::Name;
    if (s == "price_asc") return SortKey::PriceAsc;
    if (s == "price_desc") return SortKey::PriceDesc;
    return SortKey::Newest;
}

inline const char* sortCriteriaLabel(SortKey k) {
    switch (k) {
        case SortKey::Name: return "Nama A-Z";
        case SortKey::PriceAsc: return "Harga terendah";
        case SortKey::PriceDesc: return "Harga tertinggi";
        case SortKey::Newest: return "Produk terbaru";
    }
    return "Produk terbaru";
}

// Nilai yang dibandingkan, ditampilkan di log
inline std::string keyLabel(const Product* p, SortKey k) {
    if (p == nullptr) return "(null)";
    switch (k) {
        case SortKey::Name: return "\"" + p->name + "\"";
        case SortKey::PriceAsc:
        case SortKey::PriceDesc: return std::to_string(p->price);
        case SortKey::Newest: {
            char buf[32] = "?";
            std::time_t t = static_cast<std::time_t>(p->createdTs);
            std::tm* tmv = std::gmtime(&t);
            if (tmv != nullptr) std::strftime(buf, sizeof(buf), "%Y-%m-%d", tmv);
            return "#" + std::to_string(p->id) + " (" + buf + ")";
        }
    }
    return "?";
}

// > 0 artinya a harus berada SETELAH b pada urutan akhir
inline int compareProducts(const Product* a, const Product* b, SortKey key) {
    switch (key) {
        case SortKey::Name: {
            int c = util::lower(a->name).compare(util::lower(b->name));
            return c > 0 ? 1 : (c < 0 ? -1 : 0);
        }
        case SortKey::PriceAsc: return a->price > b->price ? 1 : (a->price < b->price ? -1 : 0);
        case SortKey::PriceDesc: return a->price < b->price ? 1 : (a->price > b->price ? -1 : 0);
        case SortKey::Newest:
            if (a->createdTs != b->createdTs) return a->createdTs < b->createdTs ? 1 : -1;
            return a->id < b->id ? 1 : (a->id > b->id ? -1 : 0);
    }
    return 0;
}

inline std::string joinList(const std::vector<std::string>& v) {
    std::string out;
    for (size_t i = 0; i < v.size(); ++i) {
        if (i > 0) out += ", ";
        out += v[i];
    }
    return out;
}

inline std::string joinLines(const std::vector<std::string>& v) {
    std::string out;
    for (size_t i = 0; i < v.size(); ++i) {
        if (i > 0) out += "\n";
        out += v[i];
    }
    return out;
}

// ---------- LOG ----------
struct SortLog {
    std::string method = "Bubble Sort";
    std::string criteria;
    std::vector<std::string> lines;
    std::vector<std::string> before, after;
    long comparisons = 0;
    long swaps = 0;
    int count = 0;
    bool truncated = false;
    void add(const std::string& l) {
        if (lines.size() < MAX_LOG_LINES) lines.push_back(l);
        else truncated = true;
    }
    std::string text() const {
        std::string t = joinLines(lines);
        if (truncated) t += "\n(Log dipotong pada " + std::to_string(MAX_LOG_LINES) + " baris; total di atas tetap dihitung penuh)";
        return t;
    }
};

struct SearchLog {
    std::string method = "Linear Search";
    std::string keyword;
    std::vector<std::string> lines;
    long checked = 0;
    int matches = 0;
    int count = 0;
    bool truncated = false;
    void add(const std::string& l) {
        if (lines.size() < MAX_LOG_LINES) lines.push_back(l);
        else truncated = true;
    }
    std::string text() const {
        std::string t = joinLines(lines);
        if (truncated) t += "\n(Log dipotong pada " + std::to_string(MAX_LOG_LINES) + " baris; total di atas tetap dihitung penuh)";
        return t;
    }
};

// ---------- SORTING: Bubble Sort (POINTER ke elemen array Product) ----------
// arr  : pointer ke elemen pertama array
// n    : jumlah elemen valid
inline void bubbleSort(Product* arr, int n, SortKey key, SortLog* log) {
    if (log == nullptr) return;  // log wajib ada, hindari dereferensi nullptr
    log->criteria = sortCriteriaLabel(key);
    log->add("Metode: Bubble Sort");
    log->add(std::string("Kriteria: ") + log->criteria);
    if (arr == nullptr || n <= 0) {
        log->count = 0;
        log->add("Jumlah data: 0");
        log->add("Sebelum: []");
        log->add("Data kosong, tidak ada yang diurutkan");
        log->add("Sesudah: []");
        log->add("Total perbandingan: 0");
        log->add("Total pertukaran: 0");
        return;
    }
    log->count = n;
    log->add("Jumlah data: " + std::to_string(n));
    for (const Product* p = arr; p != arr + n; ++p) log->before.push_back(keyLabel(p, key));
    log->add("Sebelum: [" + joinList(log->before) + "]");

    for (int pass = 0; pass < n - 1; ++pass) {
        bool swapped = false;
        log->add("-- Putaran " + std::to_string(pass + 1) + " --");
        for (int j = 0; j < n - 1 - pass; ++j) {
            Product* left = arr + j;       // pointer ke elemen kiri
            Product* right = arr + j + 1;  // pointer ke elemen kanan (selalu < arr + n)
            std::string l = keyLabel(left, key), r = keyLabel(right, key);
            ++log->comparisons;
            log->add("Bandingkan " + l + " dengan " + r);
            if (compareProducts(left, right, key) > 0) {
                std::swap(*left, *right);
                ++log->swaps;
                swapped = true;
                log->add("Tukar " + l + " dengan " + r);
            }
        }
        if (!swapped) {
            log->add("Tidak ada pertukaran pada putaran ini, pengurutan berhenti lebih awal");
            break;
        }
    }
    for (const Product* p = arr; p != arr + n; ++p) log->after.push_back(keyLabel(p, key));
    log->add("Sesudah: [" + joinList(log->after) + "]");
    log->add("Total perbandingan: " + std::to_string(log->comparisons));
    log->add("Total pertukaran: " + std::to_string(log->swaps));
}

// ---------- SEARCHING: Linear Search ----------
// Memeriksa SETIAP elemen dari indeks 0 sampai n-1 (katalog butuh semua hasil yang cocok).
// matchIdx : array int penampung indeks yang cocok (kapasitas maxMatches)
// return   : jumlah elemen yang cocok
inline int linearSearch(const Product* arr, int n, const std::string& keyword, int* matchIdx, int maxMatches,
                        SearchLog* log) {
    if (log == nullptr) return 0;
    std::string kw = util::trim(keyword);
    log->keyword = kw;
    log->add("Metode: Linear Search");
    log->add("Kata kunci: " + kw);
    if (kw.empty()) {
        log->add("Kata kunci kosong, pencarian tidak dijalankan");
        log->add("Jumlah elemen diperiksa: 0");
        return 0;
    }
    if (arr == nullptr || matchIdx == nullptr || n <= 0 || maxMatches <= 0) {
        log->add("Data katalog kosong");
        log->add("Status: Data tidak ditemukan");
        log->add("Jumlah elemen diperiksa: 0");
        return 0;
    }
    log->count = n;
    int found = 0;
    for (int i = 0; i < n; ++i) {
        const Product* p = arr + i;
        ++log->checked;
        const char* field = nullptr;
        if (util::containsCI(p->name, kw)) field = "nama";
        else if (util::containsCI(p->brand, kw)) field = "merek";
        else if (util::containsCI(p->category, kw)) field = "kategori";
        if (field != nullptr) {
            if (found < maxMatches) matchIdx[found] = i;
            ++found;
            log->add("Periksa indeks " + std::to_string(i) + ": \"" + p->name + "\" - cocok (" + field + ")");
        } else {
            log->add("Periksa indeks " + std::to_string(i) + ": \"" + p->name + "\" - tidak cocok");
        }
    }
    log->matches = found;
    log->add(found > 0 ? "Status: Data ditemukan (" + std::to_string(found) + " produk)" : "Status: Data tidak ditemukan");
    log->add("Jumlah elemen diperiksa: " + std::to_string(log->checked));
    return found;
}

// ---------- SELF TEST (jalankan: raceparts --selftest) ----------
inline int runAlgorithmSelfTest() {
    int failed = 0;
    auto check = [&](bool ok, const char* name) {
        std::printf("[%s] %s\n", ok ? "LULUS" : "GAGAL", name);
        if (!ok) ++failed;
    };
    auto fill = [](Product* arr, const long long* prices, int n) {
        for (int i = 0; i < n; ++i) {
            arr[i].id = i + 1;
            arr[i].price = prices[i];
            arr[i].name = "Produk " + std::string(1, static_cast<char>('A' + (n - i - 1)));
            arr[i].brand = i % 2 == 0 ? "Brembo" : "NGK";
            arr[i].category = "Uji";
            arr[i].createdTs = 1700000000 + i * 86400;
        }
    };
    auto sortedBy = [](const Product* arr, int n, SortKey k) {
        for (int i = 0; i + 1 < n; ++i)
            if (compareProducts(arr + i, arr + i + 1, k) > 0) return false;
        return true;
    };

    Product arr[8];
    {  // data sudah terurut
        const long long p[5] = {10, 20, 30, 40, 50};
        fill(arr, p, 5);
        SortLog log;
        bubbleSort(arr, 5, SortKey::PriceAsc, &log);
        check(sortedBy(arr, 5, SortKey::PriceAsc) && log.swaps == 0 && log.comparisons == 4, "Sort: data sudah terurut (0 tukar, 4 banding)");
    }
    {  // data terbalik
        const long long p[5] = {50, 40, 30, 20, 10};
        fill(arr, p, 5);
        SortLog log;
        bubbleSort(arr, 5, SortKey::PriceAsc, &log);
        check(sortedBy(arr, 5, SortKey::PriceAsc) && log.swaps == 10, "Sort: data terbalik (10 tukar)");
    }
    {  // data duplikat
        const long long p[6] = {30, 10, 30, 10, 20, 20};
        fill(arr, p, 6);
        SortLog log;
        bubbleSort(arr, 6, SortKey::PriceDesc, &log);
        check(sortedBy(arr, 6, SortKey::PriceDesc) && log.after.size() == 6, "Sort: data duplikat (harga tertinggi)");
    }
    {  // data kosong dan satu elemen
        SortLog l0, l1;
        bubbleSort(nullptr, 0, SortKey::Name, &l0);
        const long long p[1] = {99};
        fill(arr, p, 1);
        bubbleSort(arr, 1, SortKey::Name, &l1);
        check(l0.comparisons == 0 && l1.comparisons == 0 && l1.swaps == 0, "Sort: data kosong dan satu elemen aman");
    }
    {  // urut nama dan terbaru
        const long long p[4] = {5, 6, 7, 8};
        fill(arr, p, 4);
        SortLog a, b;
        bubbleSort(arr, 4, SortKey::Name, &a);
        bool nameOk = sortedBy(arr, 4, SortKey::Name) && arr[0].name == "Produk A";
        bubbleSort(arr, 4, SortKey::Newest, &b);
        check(nameOk && sortedBy(arr, 4, SortKey::Newest) && arr[0].id == 4, "Sort: nama A-Z dan terbaru");
    }
    {  // searching
        const long long p[4] = {1, 2, 3, 4};
        fill(arr, p, 4);
        int idx[8];
        SearchLog found, none, empty, nullData;
        int f = linearSearch(arr, 4, "produk b", idx, 8, &found);
        int firstMatch = idx[0];  // disimpan sebelum idx dipakai ulang oleh pencarian berikutnya
        int z = linearSearch(arr, 4, "tidak-ada", idx, 8, &none);
        int e = linearSearch(arr, 4, "   ", idx, 8, &empty);
        int m = linearSearch(arr, 4, "brembo", idx, 8, &nullData);
        check(f == 1 && found.checked == 4 && firstMatch == 2, "Search: ditemukan (nama)");
        check(z == 0 && none.matches == 0 && none.checked == 4, "Search: tidak ditemukan");
        check(e == 0 && empty.checked == 0, "Search: kata kunci kosong");
        check(m == 2, "Search: cocok pada atribut merek");
        SearchLog nullLog;
        check(linearSearch(nullptr, 0, "x", idx, 8, &nullLog) == 0, "Search: array null aman");
    }
    std::printf("%s (%d gagal)\n", failed == 0 ? "SEMUA PENGUJIAN LULUS" : "ADA PENGUJIAN GAGAL", failed);
    return failed == 0 ? 0 : 1;
}
