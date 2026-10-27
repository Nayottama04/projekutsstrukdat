// routes_public.hpp - endpoint katalog, pencarian, detail produk, log algoritma, akun dan autentikasi.
#pragma once
#include "app.hpp"
#ifdef POST
#undef POST
#endif

#ifdef PUT
#undef PUT
#endif

#ifdef DELETE
#undef DELETE
#endif

// ---------- SQL bersama ----------
inline const std::string& productCardSelect() {
    static const std::string s =
        "SELECT p.id, p.name, c.name AS category, b.name AS brand, p.sold_count AS sold, "
        "UNIX_TIMESTAMP(p.created_at) AS ts, "
        "COALESCE((SELECT MIN(v.price) FROM product_variants v WHERE v.product_id=p.id AND v.is_active=1),0) AS price, "
        "COALESCE((SELECT SUM(v.stock) FROM product_variants v WHERE v.product_id=p.id AND v.is_active=1),0) AS stock, "
        "COALESCE((SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.product_id=p.id),0) AS rating, "
        "(SELECT COUNT(*) FROM reviews r WHERE r.product_id=p.id) AS rating_count, "
        "COALESCE((SELECT pi.path FROM product_images pi WHERE pi.product_id=p.id "
        "ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1),'') AS image "
        "FROM products p JOIN categories c ON c.id=p.category_id JOIN aftermarket_brands b ON b.id=p.brand_id ";
    return s;
}

inline long long saveAlgorithmLog(Db& db, const std::string& kind, const std::string& method, const std::string& criteria,
                                  const std::string& keyword, int itemCount, long comparisons, long swaps, long checked,
                                  const Param& found, const std::string& text) {
    db.exec(
        "INSERT INTO algorithm_logs (kind, method, criteria, keyword, item_count, comparisons, swaps, items_checked, found, log_text) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        {kind, method, criteria.empty() ? Param(nullptr) : Param(criteria), keyword.empty() ? Param(nullptr) : Param(keyword),
         itemCount, static_cast<long long>(comparisons), static_cast<long long>(swaps), static_cast<long long>(checked), found, text});
    long long id = db.insertId();
    // simpan hanya 200 log terakhir
    db.exec("DELETE FROM algorithm_logs WHERE id <= (SELECT id FROM (SELECT id FROM algorithm_logs ORDER BY id DESC LIMIT 1 OFFSET 199) t)");
    return id;
}

inline json stringList(const std::vector<std::string>& v) {
    json::list l;
    for (const auto& s : v) l.push_back(json(s));
    return json(l);
}

// ---------- KATALOG: ARRAY + POINTER + STRUCT + SEARCH + SORT ----------
inline json catalogHandler(Ctx& c) {
    static Product catalog[MAX_PRODUCTS];  // ARRAY: seluruh produk hasil filter dari database
    static Product results[MAX_PRODUCTS];  // ARRAY: produk yang cocok dengan kata kunci
    static int matchIdx[MAX_PRODUCTS];     // ARRAY: indeks hasil Linear Search

    std::string sql = productCardSelect() +
                      "WHERE p.is_active=1 AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.is_active=1)";
    Params params;
    long long cat = c.queryInt("category"), brand = c.queryInt("brand");
    long long motorBrand = c.queryInt("motor_brand"), motorModel = c.queryInt("motor_model");
    long long minPrice = c.queryInt("min"), maxPrice = c.queryInt("max");
    if (cat > 0) { sql += " AND p.category_id=?"; params.push_back(cat); }
    if (brand > 0) { sql += " AND p.brand_id=?"; params.push_back(brand); }
    if (motorBrand > 0) {
        sql += " AND EXISTS (SELECT 1 FROM product_motor_compatibilities pm JOIN motor_models mm ON mm.id=pm.motor_model_id "
               "WHERE pm.product_id=p.id AND mm.motor_brand_id=?)";
        params.push_back(motorBrand);
    }
    if (motorModel > 0) {
        sql += " AND EXISTS (SELECT 1 FROM product_motor_compatibilities pm WHERE pm.product_id=p.id AND pm.motor_model_id=?)";
        params.push_back(motorModel);
    }
    sql += " ORDER BY p.id";
    Table t = c.db.query(sql, params);

    // 1) petakan baris database ke array struct Product (filter harga dilakukan di sini)
    int n = 0;
    for (size_t r = 0; r < t.size() && n < MAX_PRODUCTS; ++r) {
        long long price = t.i64(r, "price");
        if (minPrice > 0 && price < minPrice) continue;
        if (maxPrice > 0 && price > maxPrice) continue;
        Product* p = catalog + n;  // pointer ke slot array
        p->id = static_cast<int>(t.i64(r, "id"));
        p->name = t.str(r, "name");
        p->brand = t.str(r, "brand");
        p->category = t.str(r, "category");
        p->image = t.str(r, "image");
        p->price = price;
        p->stock = static_cast<int>(t.i64(r, "stock"));
        p->sold = static_cast<int>(t.i64(r, "sold"));
        p->rating = t.dbl(r, "rating");
        p->ratingCount = static_cast<int>(t.i64(r, "rating_count"));
        p->createdTs = t.i64(r, "ts");
        ++n;
    }

    // 2) SEARCHING: Linear Search pada array katalog bila ada kata kunci
    Product* view = catalog;
    int viewCount = n;
    std::string q = util::trim(c.query("q"));
    SearchLog searchLog;
    long long searchLogId = 0;
    if (!q.empty()) {
        int found = linearSearch(catalog, n, q, matchIdx, MAX_PRODUCTS, &searchLog);
        int m = 0;
        for (int i = 0; i < found && i < MAX_PRODUCTS; ++i) results[m++] = catalog[matchIdx[i]];
        view = results;  // hasil pencarian menjadi data yang ditampilkan katalog
        viewCount = m;
        searchLogId = saveAlgorithmLog(c.db, "search", searchLog.method, "", q, n, 0, 0, searchLog.checked,
                                       searchLog.matches > 0 ? 1 : 0, searchLog.text());
    }

    // 3) SORTING: Bubble Sort pada data yang akan ditampilkan
    SortKey key = parseSortKey(c.query("sort", "newest"));
    SortLog sortLog;
    bubbleSort(view, viewCount, key, &sortLog);
    long long sortLogId = saveAlgorithmLog(c.db, "sort", sortLog.method, sortLog.criteria, q, viewCount, sortLog.comparisons,
                                           sortLog.swaps, 0, Param(nullptr), sortLog.text());

    json::list items;
    for (const Product* p = view; p != view + viewCount; ++p) {
        json o = jobj();
        o["id"] = p->id;
        o["name"] = p->name;
        o["brand"] = p->brand;
        o["category"] = p->category;
        o["image"] = p->image;
        o["price"] = jnum(p->price);
        o["stock"] = p->stock;
        o["sold"] = p->sold;
        o["rating"] = p->rating;
        o["rating_count"] = p->ratingCount;
        items.push_back(std::move(o));
    }

    json out = jobj();
    out["products"] = json(items);
    out["total"] = viewCount;
    out["catalog_size"] = n;
    json s = jobj();
    s["method"] = sortLog.method;
    s["criteria"] = sortLog.criteria;
    s["count"] = sortLog.count;
    s["comparisons"] = jnum(sortLog.comparisons);
    s["swaps"] = jnum(sortLog.swaps);
    s["before"] = stringList(sortLog.before);
    s["after"] = stringList(sortLog.after);
    s["log_id"] = jnum(sortLogId);
    out["sort"] = std::move(s);
    if (!q.empty()) {
        json se = jobj();
        se["method"] = searchLog.method;
        se["keyword"] = searchLog.keyword;
        se["checked"] = jnum(searchLog.checked);
        se["matches"] = searchLog.matches;
        se["found"] = searchLog.matches > 0;
        se["log_id"] = jnum(searchLogId);
        out["search"] = std::move(se);
    } else {
        out["search"] = jnull();
    }
    return out;
}

inline json specsJson(const std::string& specs) {
    json::list l;
    size_t pos = 0;
    while (pos <= specs.size()) {
        size_t nl = specs.find('\n', pos);
        std::string line = util::trim(specs.substr(pos, nl == std::string::npos ? std::string::npos : nl - pos));
        if (!line.empty()) {
            size_t colon = line.find(':');
            json o = jobj();
            if (colon == std::string::npos) {
                o["k"] = "";
                o["v"] = line;
            } else {
                o["k"] = util::trim(line.substr(0, colon));
                o["v"] = util::trim(line.substr(colon + 1));
            }
            l.push_back(std::move(o));
        }
        if (nl == std::string::npos) break;
        pos = nl + 1;
    }
    return json(l);
}

inline json reviewsOf(Db& db, long long productId) {
    return tableJson(db.query(
        "SELECT r.id, r.rating, r.comment, DATE_FORMAT(r.created_at,'%d %b %Y') AS date, u.name AS user_name "
        "FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.id DESC LIMIT 50",
        {productId}));
}

inline json productDetail(Db& db, long long id, bool onlyActive) {
    std::string sql = productCardSelect().substr(0, productCardSelect().find(" FROM products p"));
    sql += ", p.description, p.specs, p.category_id, p.brand_id, p.is_active "
           "FROM products p JOIN categories c ON c.id=p.category_id JOIN aftermarket_brands b ON b.id=p.brand_id WHERE p.id=?";
    if (onlyActive) sql += " AND p.is_active=1";
    Table t = db.query(sql, {id});
    if (t.empty()) fail(404, "Produk tidak ditemukan");
    json o = rowJson(t, 0);
    o["specs"] = specsJson(t.str(0, "specs"));
    o["specs_raw"] = t.str(0, "specs");
    o["variants"] = tableJson(db.query(
        std::string("SELECT id, name, sku, price, stock, is_active FROM product_variants WHERE product_id=?") +
            (onlyActive ? " AND is_active=1" : "") + " ORDER BY price, id",
        {id}));
    o["images"] = tableJson(db.query("SELECT path, is_primary FROM product_images WHERE product_id=? ORDER BY is_primary DESC, sort_order, id", {id}));
    o["compatibility"] = tableJson(db.query(
        "SELECT mm.id, mm.name, mb.name AS brand FROM product_motor_compatibilities pm "
        "JOIN motor_models mm ON mm.id=pm.motor_model_id JOIN motor_brands mb ON mb.id=mm.motor_brand_id "
        "WHERE pm.product_id=? ORDER BY mb.name, mm.name",
        {id}));
    o["reviews"] = reviewsOf(db, id);
    return o;
}

// ---------- validasi akun ----------
inline std::string normalizePhone(const std::string& raw) {
    std::string out;
    for (char ch : raw) if (ch != ' ' && ch != '-') out.push_back(ch);
    return out;
}

inline void validatePhone(const std::string& phone) {
    std::string digits = (!phone.empty() && phone[0] == '+') ? phone.substr(1) : phone;
    if (!util::allDigits(digits) || digits.size() < 8 || digits.size() > 15) fail(400, "Nomor telepon harus 8-15 digit angka");
}

inline void validateEmail(const std::string& email) {
    size_t at = email.find('@');
    if (email.size() > 120 || at == std::string::npos || at == 0 || email.find('@', at + 1) != std::string::npos ||
        email.find('.', at) == std::string::npos || email.find(' ') != std::string::npos || email.back() == '.')
        fail(400, "Format email tidak valid");
}

struct AddressInput {
    std::string label, recipient, phone, street, city, province, postal;
};

inline AddressInput readAddress(Ctx& c, const rjson& b, const std::string& defRecipient, const std::string& defPhone) {
    AddressInput a;
    a.label = util::trim(jStr(b, "label", "Rumah"));
    if (a.label.empty()) a.label = "Rumah";
    a.recipient = util::trim(jStr(b, "recipient", defRecipient));
    a.phone = normalizePhone(util::trim(jStr(b, "address_phone", jStr(b, "phone", defPhone))));
    a.street = util::trim(jStr(b, "street"));
    a.city = util::trim(jStr(b, "city"));
    a.province = util::trim(jStr(b, "province"));
    a.postal = util::trim(jStr(b, "postal_code"));
    (void)c;
    if (a.recipient.size() < 2 || a.recipient.size() > 100) fail(400, "Nama penerima wajib diisi (2-100 karakter)");
    validatePhone(a.phone);
    if (a.street.size() < 5 || a.street.size() > 255) fail(400, "Alamat lengkap wajib diisi (minimal 5 karakter)");
    if (a.city.size() < 2 || a.city.size() > 80) fail(400, "Kota/kabupaten wajib diisi");
    if (a.province.size() < 2 || a.province.size() > 80) fail(400, "Provinsi wajib diisi");
    if (a.postal.size() != 5 || !util::allDigits(a.postal)) fail(400, "Kode pos harus 5 digit angka");
    if (a.label.size() > 40) a.label = a.label.substr(0, 40);
    return a;
}

inline json userJson(const User& u) {
    json o = jobj();
    o["id"] = jnum(u.id);
    o["name"] = u.name;
    o["username"] = u.username;
    o["role"] = u.role;
    return o;
}

inline void registerPublicRoutes(crow::SimpleApp& app, AppState& st) {
    CROW_ROUTE(app, "/api/health")([&st](const crow::request& req) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json {
            json o = jobj();
            o["status"] = "ok";
            o["database"] = c.db.ping();
            return o;
        });
    });

    CROW_ROUTE(app, "/api/meta")([&st](const crow::request& req) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json {
            json o = jobj();
            o["store"] = "RaceParts";
            o["categories"] = tableJson(c.db.query(
                "SELECT c.id, c.name, c.slug, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.is_active=1) AS product_count "
                "FROM categories c ORDER BY c.id"));
            o["brands"] = tableJson(c.db.query("SELECT id, name FROM aftermarket_brands ORDER BY name"));
            o["motor_brands"] = tableJson(c.db.query("SELECT id, name FROM motor_brands ORDER BY name"));
            o["motor_models"] = tableJson(c.db.query("SELECT id, motor_brand_id, name FROM motor_models ORDER BY name"));
            o["shipping"] = tableJson(c.db.query(
                "SELECT s.id, s.code, s.name, s.description, s.eta_text, r.base_cost, r.per_item_cost "
                "FROM shipping_services s JOIN shipping_rates r ON r.service_id=s.id WHERE s.is_active=1 ORDER BY s.id"));
            o["banks"] = stringList(simulatedBanks());
            o["payment_expiry_minutes"] = kPaymentExpiryMinutes;
            return o;
        });
    });

    // ---------- katalog ----------
    CROW_ROUTE(app, "/api/products")([&st](const crow::request& req) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json { return catalogHandler(c); });
    });

    CROW_ROUTE(app, "/api/search")([&st](const crow::request& req) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json { return catalogHandler(c); });
    });

    CROW_ROUTE(app, "/api/products/<int>")([&st](const crow::request& req, int id) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json { return productDetail(c.db, id, true); });
    });

    CROW_ROUTE(app, "/api/products/<int>/reviews")([&st](const crow::request& req, int id) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json { return reviewsOf(c.db, id); });
    });

    CROW_ROUTE(app, "/api/algorithm-logs/<int>")([&st](const crow::request& req, int id) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json {
            Table t = c.db.query(
                "SELECT id, kind, method, criteria, keyword, item_count, comparisons, swaps, items_checked, found, log_text, "
                "DATE_FORMAT(created_at,'%d %b %Y %H:%i:%s') AS created_at FROM algorithm_logs WHERE id=?",
                {id});
            if (t.empty()) fail(404, "Log tidak ditemukan (log lama dihapus otomatis setelah 200 entri)");
            return rowJson(t, 0);
        });
    });

    // ---------- autentikasi ----------
    CROW_ROUTE(app, "/api/auth/register").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json {
            std::string name = c.needStr("name", "Nama", 2, 100);
            std::string username = util::lower(c.needStr("username", "Username", 3, 30));
            for (char ch : username)
                if (!((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '.'))
                    fail(400, "Username hanya boleh huruf, angka, titik, dan garis bawah");
            std::string phone = normalizePhone(c.needStr("phone", "Nomor telepon", 8, 20));
            validatePhone(phone);
            std::string email = util::lower(c.needStr("email", "Email", 5, 120));
            validateEmail(email);
            std::string password = jStr(c.body(), "password");
            if (password.size() < 8) fail(400, "Password minimal 8 karakter");
            if (password.size() > 72) fail(400, "Password maksimal 72 karakter");
            AddressInput a = readAddress(c, c.body(), name, phone);

            if (!c.db.query("SELECT id FROM users WHERE username=?", {username}).empty()) fail(409, "Username sudah dipakai");
            if (!c.db.query("SELECT id FROM users WHERE email=?", {email}).empty()) fail(409, "Email sudah terdaftar");

            User u;
            {
                Tx tx(c.db);
                c.db.exec("INSERT INTO users (name, username, phone, email, password_hash, role) VALUES (?,?,?,?,?, 'customer')",
                          {name, username, phone, email, util::hashPassword(password)});
                u.id = c.db.insertId();
                c.db.exec("INSERT INTO addresses (user_id, label, recipient, phone, street, city, province, postal_code, is_default) "
                          "VALUES (?,?,?,?,?,?,?,?,1)",
                          {u.id, a.label, a.recipient, a.phone, a.street, a.city, a.province, a.postal});
                c.db.exec("INSERT INTO carts (user_id) VALUES (?)", {u.id});
                tx.commit();
            }
            u.name = name;
            u.username = username;
            u.role = "customer";
            c.status = 201;
            json o = jobj();
            o["token"] = createSession(c.st, u);
            o["user"] = userJson(u);
            return o;
        });
    });

    CROW_ROUTE(app, "/api/auth/login").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json {
            std::string identity = util::lower(util::trim(jStr(c.body(), "identity")));
            std::string password = jStr(c.body(), "password");
            if (identity.empty() || password.empty()) fail(400, "Username/email dan password wajib diisi");
            Table t = c.db.query("SELECT id, name, username, role, password_hash FROM users WHERE username=? OR email=? LIMIT 1",
                                 {identity, identity});
            static const std::string dummy = util::hashPassword("tidak-dipakai");
            bool ok = util::verifyPassword(password, t.empty() ? dummy : t.str(0, "password_hash"));
            if (t.empty() || !ok) fail(401, "Username/email atau password salah");
            User u;
            u.id = t.i64(0, "id");
            u.name = t.str(0, "name");
            u.username = t.str(0, "username");
            u.role = t.str(0, "role");
            json o = jobj();
            o["token"] = createSession(c.st, u);
            o["user"] = userJson(u);
            return o;
        });
    });

    CROW_ROUTE(app, "/api/auth/logout").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::None, [&](Ctx& c) -> json {
            c.st.sessions.erase(c.token);
            json o = jobj();
            o["ok"] = true;
            return o;
        });
    });

    // ---------- profil & alamat ----------
    auto meJson = [](Ctx& c) -> json {
        Table t = c.db.query("SELECT id, name, username, email, phone, role FROM users WHERE id=?", {c.user.id});
        if (t.empty()) fail(401, "Akun tidak ditemukan");
        json o = rowJson(t, 0);
        o["addresses"] = tableJson(c.db.query(
            "SELECT id, label, recipient, phone, street, city, province, postal_code, is_default FROM addresses "
            "WHERE user_id=? ORDER BY is_default DESC, id",
            {c.user.id}));
        return o;
    };

    CROW_ROUTE(app, "/api/me")([&st, meJson](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json { return meJson(c); });
    });

    CROW_ROUTE(app, "/api/me").methods(crow::HTTPMethod::Put)([&st, meJson](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            std::string name = c.needStr("name", "Nama", 2, 100);
            std::string phone = normalizePhone(c.needStr("phone", "Nomor telepon", 8, 20));
            validatePhone(phone);
            std::string email = util::lower(c.needStr("email", "Email", 5, 120));
            validateEmail(email);
            if (!c.db.query("SELECT id FROM users WHERE email=? AND id<>?", {email, c.user.id}).empty()) fail(409, "Email sudah dipakai akun lain");
            c.db.exec("UPDATE users SET name=?, phone=?, email=? WHERE id=?", {name, phone, email, c.user.id});
            c.st.sessions[c.token].user.name = name;
            return meJson(c);
        });
    });

    CROW_ROUTE(app, "/api/addresses").methods(crow::HTTPMethod::Post)([&st, meJson](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            AddressInput a = readAddress(c, c.body(), c.user.name, "");
            bool makeDefault = jBool(c.body(), "is_default", false);
            Table cnt = c.db.query("SELECT COUNT(*) AS n FROM addresses WHERE user_id=?", {c.user.id});
            if (cnt.i64(0, "n") >= 10) fail(400, "Maksimal 10 alamat tersimpan");
            if (cnt.i64(0, "n") == 0) makeDefault = true;
            Tx tx(c.db);
            if (makeDefault) c.db.exec("UPDATE addresses SET is_default=0 WHERE user_id=?", {c.user.id});
            c.db.exec("INSERT INTO addresses (user_id, label, recipient, phone, street, city, province, postal_code, is_default) "
                      "VALUES (?,?,?,?,?,?,?,?,?)",
                      {c.user.id, a.label, a.recipient, a.phone, a.street, a.city, a.province, a.postal, makeDefault ? 1 : 0});
            tx.commit();
            c.status = 201;
            return meJson(c);
        });
    });

    CROW_ROUTE(app, "/api/addresses/<int>").methods(crow::HTTPMethod::Delete)([&st, meJson](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            if (c.db.exec("DELETE FROM addresses WHERE id=? AND user_id=?", {id, c.user.id}) == 0) fail(404, "Alamat tidak ditemukan");
            Table left = c.db.query("SELECT id FROM addresses WHERE user_id=? AND is_default=1", {c.user.id});
            if (left.empty()) c.db.exec("UPDATE addresses SET is_default=1 WHERE user_id=? ORDER BY id LIMIT 1", {c.user.id});
            return meJson(c);
        });
    });
}
