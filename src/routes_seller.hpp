// routes_seller.hpp - endpoint dashboard Seller/Admin. Semua endpoint memerlukan login dengan peran 'seller'.
#pragma once
#include <cstring>
#include <filesystem>
#include <fstream>

#include "app.hpp"
#include "routes_public.hpp"
#include "routes_shop.hpp"

inline bool safeImagePath(const std::string& p) {
    if (p.empty() || p.size() > 255 || p.find("..") != std::string::npos || p.find(' ') != std::string::npos) return false;
    if (!(p[0] == '/' || p.compare(0, 7, "http://") == 0 || p.compare(0, 8, "https://") == 0)) return false;
    // hanya path yang berakhiran ekstensi gambar (SVG hanya untuk gambar bawaan lama)
    std::string q = p.substr(0, p.find_first_of("?#"));
    size_t dot = q.rfind('.');
    if (dot == std::string::npos) return false;
    std::string ext = util::lower(q.substr(dot + 1));
    return ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "webp" || ext == "gif" || ext == "svg";
}

// Mengenali format foto dari ISI file (bukan dari nama/ekstensi). Mengembalikan nullptr bila bukan foto yang didukung.
inline const char* sniffImageExt(const std::string& d) {
    if (d.size() >= 8 && std::memcmp(d.data(), "\x89PNG\r\n\x1a\n", 8) == 0) return "png";
    if (d.size() >= 3 && static_cast<unsigned char>(d[0]) == 0xFF && static_cast<unsigned char>(d[1]) == 0xD8 && static_cast<unsigned char>(d[2]) == 0xFF) return "jpg";
    if (d.size() >= 12 && d.compare(0, 4, "RIFF") == 0 && d.compare(8, 4, "WEBP") == 0) return "webp";
    if (d.size() >= 6 && (d.compare(0, 6, "GIF87a") == 0 || d.compare(0, 6, "GIF89a") == 0)) return "gif";
    return nullptr;
}

// Simpan produk baru (id == 0) atau perbarui produk yang ada, lengkap dengan varian, gambar, dan kompatibilitas motor.
inline long long saveProduct(Ctx& c, long long id) {
    const rjson& b = c.body();
    std::string name = c.needStr("name", "Nama produk", 2, 160);
    std::string description = util::trim(jStr(b, "description"));
    std::string specs = util::trim(jStr(b, "specs"));
    if (description.size() > 5000) fail(400, "Deskripsi maksimal 5000 karakter");
    if (specs.size() > 3000) fail(400, "Spesifikasi maksimal 3000 karakter");
    long long categoryId = jInt(b, "category_id"), brandId = jInt(b, "brand_id");
    if (c.db.query("SELECT id FROM categories WHERE id=?", {categoryId}).empty()) fail(400, "Pilih kategori produk");
    if (c.db.query("SELECT id FROM aftermarket_brands WHERE id=?", {brandId}).empty()) fail(400, "Pilih merek aftermarket");
    bool active = jBool(b, "is_active", true);

    struct V { long long id = 0; std::string name, sku; long long price = 0, stock = 0; };
    std::vector<V> variants;
    if (!jIsList(b, "variants") || b["variants"].size() == 0) fail(400, "Produk harus memiliki minimal satu varian");
    if (b["variants"].size() > 20) fail(400, "Maksimal 20 varian per produk");
    for (const auto& v : b["variants"]) {
        V x;
        x.id = jInt(v, "id");
        x.name = util::trim(jStr(v, "name"));
        x.sku = util::trim(jStr(v, "sku"));
        x.price = jInt(v, "price", -1);
        x.stock = jInt(v, "stock", -1);
        if (x.name.empty() || x.name.size() > 80) fail(400, "Nama varian wajib diisi (maksimal 80 karakter)");
        if (x.sku.empty() || x.sku.size() > 40) fail(400, "SKU varian wajib diisi (maksimal 40 karakter)");
        if (x.price < 0 || x.price > 10000000000LL) fail(400, "Harga varian \"" + x.name + "\" tidak valid");
        if (x.stock < 0 || x.stock > 1000000) fail(400, "Stok varian \"" + x.name + "\" tidak valid");
        for (const V& other : variants)
            if (other.sku == x.sku) fail(400, "SKU \"" + x.sku + "\" dipakai dua kali pada form ini");
        variants.push_back(x);
    }

    std::vector<std::string> images;
    if (jIsList(b, "images"))
        for (const auto& im : b["images"]) {
            if (im.t() != crow::json::type::String) continue;
            std::string p = util::trim(std::string(im.s()));
            if (p.empty()) continue;
            if (!safeImagePath(p)) fail(400, "Path gambar tidak valid: " + p + " (gunakan foto PNG, JPG, atau WebP)");
            images.push_back(p);
            if (images.size() >= 8) break;
        }
    if (images.empty()) images.push_back("/img/produk.png");

    std::vector<long long> motorIds;
    if (jIsList(b, "motor_model_ids"))
        for (const auto& m : b["motor_model_ids"])
            if (m.t() == crow::json::type::Number) {
                long long mid = static_cast<long long>(m.d());
                if (c.db.query("SELECT id FROM motor_models WHERE id=?", {mid}).empty()) fail(400, "Model motor tidak valid");
                motorIds.push_back(mid);
            }

    Tx tx(c.db);
    if (id == 0) {
        c.db.exec("INSERT INTO products (name, description, specs, category_id, brand_id, is_active) VALUES (?,?,?,?,?,?)",
                  {name, description, specs, categoryId, brandId, active ? 1 : 0});
        id = c.db.insertId();
    } else {
        if (c.db.query("SELECT id FROM products WHERE id=?", {id}).empty()) fail(404, "Produk tidak ditemukan");
        c.db.exec("UPDATE products SET name=?, description=?, specs=?, category_id=?, brand_id=?, is_active=? WHERE id=?",
                  {name, description, specs, categoryId, brandId, active ? 1 : 0, id});
    }

    Table existing = c.db.query("SELECT id, stock FROM product_variants WHERE product_id=?", {id});
    std::vector<long long> keptIds;
    for (const V& v : variants) {
        Table dup = c.db.query("SELECT id FROM product_variants WHERE sku=? AND id<>?", {v.sku, v.id});
        if (!dup.empty()) fail(409, "SKU \"" + v.sku + "\" sudah dipakai produk lain");
        bool isExisting = false;
        long long oldStock = 0;
        for (size_t i = 0; i < existing.size(); ++i)
            if (existing.i64(i, "id") == v.id && v.id > 0) {
                isExisting = true;
                oldStock = existing.i64(i, "stock");
            }
        if (isExisting) {
            c.db.exec("UPDATE product_variants SET name=?, sku=?, price=?, stock=?, is_active=1 WHERE id=?",
                      {v.name, v.sku, v.price, v.stock, v.id});
            if (v.stock != oldStock)
                c.db.exec("INSERT INTO inventory_movements (variant_id, delta, reason) VALUES (?,?,'seller_adjust')", {v.id, v.stock - oldStock});
            keptIds.push_back(v.id);
        } else {
            c.db.exec("INSERT INTO product_variants (product_id, name, sku, price, stock, is_active) VALUES (?,?,?,?,?,1)",
                      {id, v.name, v.sku, v.price, v.stock});
            long long vid = c.db.insertId();
            if (v.stock > 0) c.db.exec("INSERT INTO inventory_movements (variant_id, delta, reason) VALUES (?,?,'initial')", {vid, v.stock});
            keptIds.push_back(vid);
        }
    }
    for (size_t i = 0; i < existing.size(); ++i) {  // varian yang dihapus dari form diarsipkan agar riwayat pesanan tetap utuh
        long long vid = existing.i64(i, "id");
        bool kept = false;
        for (long long k : keptIds) if (k == vid) kept = true;
        if (!kept) c.db.exec("UPDATE product_variants SET is_active=0 WHERE id=?", {vid});
    }

    c.db.exec("DELETE FROM product_images WHERE product_id=?", {id});
    for (size_t i = 0; i < images.size(); ++i)
        c.db.exec("INSERT INTO product_images (product_id, path, is_primary, sort_order) VALUES (?,?,?,?)",
                  {id, images[i], i == 0 ? 1 : 0, static_cast<int>(i)});

    c.db.exec("DELETE FROM product_motor_compatibilities WHERE product_id=?", {id});
    for (long long mid : motorIds) c.db.exec("INSERT IGNORE INTO product_motor_compatibilities (product_id, motor_model_id) VALUES (?,?)", {id, mid});
    tx.commit();
    return id;
}

struct MasterTable {
    const char* table;
    bool hasSlug;
    bool hasParent;
};

inline const MasterTable* masterTable(const std::string& type) {
    static const MasterTable categories{"categories", true, false};
    static const MasterTable brands{"aftermarket_brands", false, false};
    static const MasterTable motorBrands{"motor_brands", false, false};
    static const MasterTable motorModels{"motor_models", false, true};
    if (type == "categories") return &categories;
    if (type == "brands") return &brands;
    if (type == "motor-brands") return &motorBrands;
    if (type == "motor-models") return &motorModels;
    return nullptr;
}

inline void registerSellerRoutes(crow::SimpleApp& app, AppState& st) {
    // ---------- unggah foto produk (PNG/JPG/WebP/GIF) ----------
    CROW_ROUTE(app, "/api/seller/upload").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            const std::string& data = c.req.body;
            if (data.empty()) fail(400, "File foto kosong");
            if (data.size() > 8u * 1024u * 1024u) fail(413, "Ukuran foto maksimal 8 MB");
            const char* ext = sniffImageExt(data);
            if (ext == nullptr) fail(400, "Format foto harus PNG, JPG, WebP, atau GIF");
            const std::string dir = c.st.frontendDir + "/img/products";
            std::error_code ec;
            std::filesystem::create_directories(dir, ec);
            if (ec) fail(500, "Folder penyimpanan foto tidak dapat dibuat");
            const std::string name = "p" + util::randomHex(8) + "." + ext;  // nama acak: tidak memakai nama dari pengguna
            std::ofstream out(dir + "/" + name, std::ios::binary);
            if (!out) fail(500, "Foto tidak dapat disimpan");
            out.write(data.data(), static_cast<std::streamsize>(data.size()));
            out.close();
            c.status = 201;
            json o = jobj();
            o["path"] = "/img/products/" + name;
            o["size"] = jnum(static_cast<long long>(data.size()));
            return o;
        });
    });

    CROW_ROUTE(app, "/api/seller/summary")([&st](const crow::request& req) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            expireStaleOrders(c.db);
            const std::string paid = "status NOT IN ('Menunggu Pembayaran','Dibatalkan')";
            json o = jobj();
            Table rev = c.db.query("SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS orders FROM orders WHERE " + paid);
            o["revenue"] = jnum(rev.i64(0, "revenue"));
            o["paid_orders"] = jnum(rev.i64(0, "orders"));
            o["items_sold"] = jnum(c.db.query("SELECT COALESCE(SUM(oi.quantity),0) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id "
                                              "WHERE o.status NOT IN ('Menunggu Pembayaran','Dibatalkan')").i64(0, "n"));
            o["products"] = jnum(c.db.query("SELECT COUNT(*) AS n FROM products WHERE is_active=1").i64(0, "n"));
            o["by_status"] = tableJson(c.db.query("SELECT status, COUNT(*) AS n FROM orders GROUP BY status"));
            o["top_products"] = tableJson(c.db.query(
                "SELECT oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.quantity*oi.unit_price) AS revenue FROM order_items oi "
                "JOIN orders o ON o.id=oi.order_id WHERE o.status NOT IN ('Menunggu Pembayaran','Dibatalkan') "
                "GROUP BY oi.product_id, oi.product_name ORDER BY qty DESC, revenue DESC LIMIT 5"));
            o["low_stock"] = tableJson(c.db.query(
                "SELECT p.id, p.name AS product_name, v.name AS variant_name, v.stock FROM product_variants v "
                "JOIN products p ON p.id=v.product_id WHERE v.is_active=1 AND p.is_active=1 AND v.stock<=5 ORDER BY v.stock, p.id LIMIT 10"));
            o["daily"] = tableJson(c.db.query(
                "SELECT DATE_FORMAT(paid_at,'%d %b') AS day, SUM(total) AS revenue FROM orders WHERE paid_at IS NOT NULL "
                "AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND " + paid + " GROUP BY DATE(paid_at), DATE_FORMAT(paid_at,'%d %b') ORDER BY DATE(paid_at)"));
            return o;
        });
    });

    // ---------- produk ----------
    CROW_ROUTE(app, "/api/seller/products")([&st](const crow::request& req) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            std::string sql = productCardSelect();
            sql.replace(sql.find("p.name,"), 7, "p.name, p.is_active,");
            return tableJson(c.db.query(sql + "ORDER BY p.id DESC"));
        });
    });

    CROW_ROUTE(app, "/api/seller/products/<int>")([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json { return productDetail(c.db, id, false); });
    });

    CROW_ROUTE(app, "/api/seller/products").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            long long id = saveProduct(c, 0);
            c.status = 201;
            return productDetail(c.db, id, false);
        });
    });

    CROW_ROUTE(app, "/api/seller/products/<int>").methods(crow::HTTPMethod::Put)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            saveProduct(c, id);
            return productDetail(c.db, id, false);
        });
    });

    CROW_ROUTE(app, "/api/seller/products/<int>").methods(crow::HTTPMethod::Delete)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            if (c.db.query("SELECT id FROM products WHERE id=?", {id}).empty()) fail(404, "Produk tidak ditemukan");
            json o = jobj();
            if (c.db.query("SELECT id FROM order_items WHERE product_id=? LIMIT 1", {id}).empty()) {
                c.db.exec("DELETE FROM products WHERE id=?", {id});
                o["archived"] = false;
            } else {
                c.db.exec("UPDATE products SET is_active=0 WHERE id=?", {id});  // sudah pernah dipesan: diarsipkan, bukan dihapus
                o["archived"] = true;
            }
            return o;
        });
    });

    // ---------- pesanan & tracking manual ----------
    CROW_ROUTE(app, "/api/seller/orders")([&st](const crow::request& req) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            expireStaleOrders(c.db);
            return orderList(c.db, 0, c.query("status"));
        });
    });

    CROW_ROUTE(app, "/api/seller/orders/<int>")([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            expireStaleOrders(c.db);
            return orderDetail(c.db, id, 0);
        });
    });

    CROW_ROUTE(app, "/api/seller/orders/<int>").methods(crow::HTTPMethod::Put)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            expireStaleOrders(c.db);
            const rjson& b = c.body();
            std::string newStatus = util::trim(jStr(b, "status"));
            std::string courier = util::trim(jStr(b, "courier"));
            std::string tracking = util::trim(jStr(b, "tracking_no"));
            std::string note = util::trim(jStr(b, "note"));
            if (courier.size() > 60 || tracking.size() > 80 || note.size() > 255) fail(400, "Isi kurir, resi, atau catatan terlalu panjang");

            Table o = c.db.query("SELECT status FROM orders WHERE id=?", {id});
            if (o.empty()) fail(404, "Pesanan tidak ditemukan");
            std::string cur = o.str(0, "status");
            if (cur == "Menunggu Pembayaran" || cur == "Dibatalkan") fail(409, "Pesanan belum dibayar atau sudah dibatalkan, status tidak dapat diubah");
            int curIdx = statusIndex(cur);

            Table shipNow = c.db.query("SELECT courier, tracking_no FROM shipments WHERE order_id=?", {id});
            std::string effCourier = courier.empty() && !shipNow.empty() ? shipNow.str(0, "courier") : courier;
            std::string effTracking = tracking.empty() && !shipNow.empty() ? shipNow.str(0, "tracking_no") : tracking;

            if (!newStatus.empty()) {
                int idx = statusIndex(newStatus);
                if (idx < 0) fail(400, "Status tidak dikenal");
                if (idx <= curIdx) fail(409, "Status tidak boleh mundur atau sama dengan status saat ini");
                if ((newStatus == "Diserahkan ke Kurir" || newStatus == "Dalam Pengiriman") && (effCourier.empty() || effTracking.empty()))
                    fail(400, "Isi nama kurir dan nomor resi sebelum menandai pesanan dikirim");
            } else if (courier.empty() && tracking.empty()) {
                fail(400, "Tidak ada perubahan yang dikirim");
            }

            Tx tx(c.db);
            if (!courier.empty() || !tracking.empty())
                c.db.exec("INSERT INTO shipments (order_id, courier, tracking_no) VALUES (?,?,?) "
                          "ON DUPLICATE KEY UPDATE courier=VALUES(courier), tracking_no=VALUES(tracking_no)",
                          {id, effCourier, effTracking});
            if (!newStatus.empty()) {
                c.db.exec("UPDATE orders SET status=? WHERE id=?", {newStatus, id});
                std::string text = note.empty() ? "Status diperbarui oleh penjual" : note;
                if (!effCourier.empty() && (newStatus == "Diserahkan ke Kurir" || newStatus == "Dalam Pengiriman"))
                    text += " (" + effCourier + ", resi " + effTracking + ")";
                addOrderEvent(c.db, id, newStatus, text, c.user.id);
            } else {
                addOrderEvent(c.db, id, cur, note.empty() ? "Info pengiriman diperbarui: " + effCourier + ", resi " + effTracking : note, c.user.id);
            }
            tx.commit();
            return orderDetail(c.db, id, 0);
        });
    });

    // ---------- ulasan, log, master data ----------
    CROW_ROUTE(app, "/api/seller/reviews")([&st](const crow::request& req) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            return tableJson(c.db.query(
                "SELECT r.id, r.rating, r.comment, DATE_FORMAT(r.created_at,'%d %b %Y') AS date, u.name AS user_name, "
                "p.name AS product_name, p.id AS product_id FROM reviews r JOIN users u ON u.id=r.user_id "
                "JOIN products p ON p.id=r.product_id ORDER BY r.id DESC LIMIT 100"));
        });
    });

    CROW_ROUTE(app, "/api/seller/algorithm-logs")([&st](const crow::request& req) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            return tableJson(c.db.query(
                "SELECT id, kind, method, criteria, keyword, item_count, comparisons, swaps, items_checked, found, "
                "DATE_FORMAT(created_at,'%d %b %H:%i:%s') AS created_at FROM algorithm_logs ORDER BY id DESC LIMIT 50"));
        });
    });

    CROW_ROUTE(app, "/api/seller/master/<string>").methods(crow::HTTPMethod::Post)([&st](const crow::request& req, const std::string& type) {
        return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
            const MasterTable* mt = masterTable(type);
            if (mt == nullptr) fail(404, "Jenis data master tidak dikenal");
            std::string name = c.needStr("name", "Nama", 2, 80);
            std::string table = mt->table;
            if (mt->hasParent) {
                long long parent = jInt(c.body(), "motor_brand_id");
                if (c.db.query("SELECT id FROM motor_brands WHERE id=?", {parent}).empty()) fail(400, "Pilih merek motor");
                c.db.exec("INSERT INTO motor_models (motor_brand_id, name) VALUES (?,?)", {parent, name});
            } else if (mt->hasSlug) {
                std::string slug = util::slugify(name);
                if (slug.empty()) fail(400, "Nama kategori tidak valid");
                c.db.exec("INSERT INTO categories (name, slug) VALUES (?,?)", {name, slug});
            } else {
                c.db.exec("INSERT INTO " + table + " (name) VALUES (?)", {name});
            }
            c.status = 201;
            json o = jobj();
            o["id"] = jnum(c.db.insertId());
            return o;
        });
    });

    CROW_ROUTE(app, "/api/seller/master/<string>/<int>").methods(crow::HTTPMethod::Delete)(
        [&st](const crow::request& req, const std::string& type, int id) {
            return run(st, req, Auth::Seller, [&](Ctx& c) -> json {
                const MasterTable* mt = masterTable(type);
                if (mt == nullptr) fail(404, "Jenis data master tidak dikenal");
                if (c.db.exec(std::string("DELETE FROM ") + mt->table + " WHERE id=?", {id}) == 0) fail(404, "Data tidak ditemukan");
                json o = jobj();
                o["ok"] = true;
                return o;
            });
        });
}
