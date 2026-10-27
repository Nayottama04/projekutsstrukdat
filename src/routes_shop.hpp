// routes_shop.hpp - keranjang, checkout, pembayaran simulasi, pesanan/tracking, ulasan, dan chat.
#pragma once
#include <ctime>

#include "app.hpp"
#include "routes_public.hpp"
#ifdef POST
#undef POST
#endif

#ifdef PUT
#undef PUT
#endif

#ifdef DELETE
#undef DELETE
#endif

inline const char* kImageSub =
    "COALESCE((SELECT pi.path FROM product_images pi WHERE pi.product_id=p.id "
    "ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1),'')";

// ---------- logika pesanan (dipakai juga oleh dashboard penjual) ----------
inline void addOrderEvent(Db& db, long long orderId, const std::string& status, const std::string& note, long long actorId) {
    db.exec("INSERT INTO shipment_events (order_id, status, note, actor_id) VALUES (?,?,?,?)",
            {orderId, status, note, actorId > 0 ? Param(actorId) : Param(nullptr)});
}

inline void restockOrder(Db& db, long long orderId, const std::string& reason) {
    Table items = db.query("SELECT variant_id, quantity FROM order_items WHERE order_id=? AND variant_id IS NOT NULL", {orderId});
    for (size_t i = 0; i < items.size(); ++i) {
        long long vid = items.i64(i, "variant_id"), qty = items.i64(i, "quantity");
        db.exec("UPDATE product_variants SET stock=stock+? WHERE id=?", {qty, vid});
        db.exec("INSERT INTO inventory_movements (variant_id, delta, reason, order_id) VALUES (?,?,?,?)", {vid, qty, reason, orderId});
    }
}

// Pesanan yang tidak dibayar dalam batas waktu otomatis dibatalkan dan stok dikembalikan.
inline void expireStaleOrders(Db& db) {
    Table t = db.query(
        "SELECT o.id FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.status='Menunggu Pembayaran' "
        "AND p.status IN ('Menunggu Pembayaran','Gagal') AND p.expires_at < NOW()");
    for (size_t i = 0; i < t.size(); ++i) {
        long long id = t.i64(i, "id");
        Tx tx(db);
        if (db.exec("UPDATE orders SET status='Dibatalkan' WHERE id=? AND status='Menunggu Pembayaran'", {id}) == 1) {
            restockOrder(db, id, "expired");
            db.exec("UPDATE payments SET status='Kedaluwarsa' WHERE order_id=?", {id});
            addOrderEvent(db, id, "Dibatalkan", "Pembayaran kedaluwarsa, stok dikembalikan", 0);
        }
        tx.commit();
    }
}

// ownerId = 0 berarti tanpa pembatasan pemilik (khusus penjual)
inline json orderDetail(Db& db, long long orderId, long long ownerId) {
    std::string sql =
        "SELECT o.id, o.order_no, o.user_id, o.recipient, o.phone, o.address_text, o.shipping_name, o.subtotal, o.shipping_cost, "
        "o.total, o.status, DATE_FORMAT(o.created_at,'%d %b %Y %H:%i') AS created_at, "
        "DATE_FORMAT(o.paid_at,'%d %b %Y %H:%i') AS paid_at, u.name AS customer_name "
        "FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?";
    Params p{orderId};
    if (ownerId > 0) {
        sql += " AND o.user_id=?";
        p.push_back(ownerId);
    }
    Table o = db.query(sql, p);
    if (o.empty()) fail(404, "Pesanan tidak ditemukan");
    json out = rowJson(o, 0);
    out["items"] = tableJson(db.query(
        "SELECT oi.id, oi.product_id, oi.variant_id, oi.product_name, oi.variant_name, oi.image_path AS image, oi.unit_price, "
        "oi.quantity, (SELECT COUNT(*) FROM reviews r WHERE r.order_id=oi.order_id AND r.product_id=oi.product_id) AS reviewed "
        "FROM order_items oi WHERE oi.order_id=? ORDER BY oi.id",
        {orderId}));
    Table pay = db.query(
        "SELECT method, bank, reference, amount, status, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_left, "
        "DATE_FORMAT(paid_at,'%d %b %Y %H:%i') AS paid_at FROM payments WHERE order_id=?",
        {orderId});
    out["payment"] = pay.empty() ? jnull() : rowJson(pay, 0);
    Table ship = db.query("SELECT courier, tracking_no FROM shipments WHERE order_id=?", {orderId});
    out["shipment"] = ship.empty() ? jnull() : rowJson(ship, 0);
    out["events"] = tableJson(db.query(
        "SELECT status, note, DATE_FORMAT(created_at,'%d %b %Y %H:%i') AS created_at FROM shipment_events WHERE order_id=? ORDER BY id",
        {orderId}));
    std::string st = o.str(0, "status");
    out["can_review"] = (st == "Diterima" || st == "Selesai");
    out["can_cancel"] = (st == "Menunggu Pembayaran");
    out["can_confirm_received"] = (st == "Dalam Pengiriman");
    return out;
}

inline json orderList(Db& db, long long ownerId, const std::string& statusFilter) {
    std::string sql =
        "SELECT o.id, o.order_no, o.status, o.total, DATE_FORMAT(o.created_at,'%d %b %Y %H:%i') AS created_at, "
        "u.name AS customer_name, "
        "(SELECT COALESCE(SUM(quantity),0) FROM order_items WHERE order_id=o.id) AS item_count, "
        "(SELECT COUNT(*) FROM order_items WHERE order_id=o.id) AS line_count, "
        "(SELECT product_name FROM order_items WHERE order_id=o.id ORDER BY id LIMIT 1) AS first_item, "
        "(SELECT image_path FROM order_items WHERE order_id=o.id ORDER BY id LIMIT 1) AS image, "
        "COALESCE((SELECT status FROM payments WHERE order_id=o.id),'') AS payment_status, "
        "COALESCE((SELECT courier FROM shipments WHERE order_id=o.id),'') AS courier, "
        "COALESCE((SELECT tracking_no FROM shipments WHERE order_id=o.id),'') AS tracking_no "
        "FROM orders o JOIN users u ON u.id=o.user_id WHERE 1=1";
    Params p;
    if (ownerId > 0) {
        sql += " AND o.user_id=?";
        p.push_back(ownerId);
    }
    if (!statusFilter.empty()) {
        sql += " AND o.status=?";
        p.push_back(statusFilter);
    }
    sql += " ORDER BY o.id DESC";
    return tableJson(db.query(sql, p));
}

// ---------- keranjang ----------
inline long long cartIdOf(Db& db, long long userId) {
    Table t = db.query("SELECT id FROM carts WHERE user_id=?", {userId});
    if (!t.empty()) return t.i64(0, "id");
    db.exec("INSERT INTO carts (user_id) VALUES (?)", {userId});
    return db.insertId();
}

inline json cartJson(Ctx& c) {
    long long cartId = cartIdOf(c.db, c.user.id);
    Table t = c.db.query(
        std::string("SELECT ci.id, ci.variant_id, ci.quantity, v.name AS variant_name, v.price AS unit_price, v.stock, "
                    "v.is_active AS v_active, p.id AS product_id, p.name AS product_name, p.is_active AS p_active, ") +
            kImageSub +
            " AS image FROM cart_items ci JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id "
            "WHERE ci.cart_id=? ORDER BY ci.id DESC",
        {cartId});
    json::list items;
    long long totalQty = 0, subtotal = 0;
    for (size_t r = 0; r < t.size(); ++r) {
        long long qty = t.i64(r, "quantity"), price = t.i64(r, "unit_price"), stock = t.i64(r, "stock");
        bool available = t.i64(r, "v_active") == 1 && t.i64(r, "p_active") == 1 && stock >= qty;
        json o = jobj();
        o["id"] = jnum(t.i64(r, "id"));
        o["variant_id"] = jnum(t.i64(r, "variant_id"));
        o["product_id"] = jnum(t.i64(r, "product_id"));
        o["product_name"] = t.str(r, "product_name");
        o["variant_name"] = t.str(r, "variant_name");
        o["image"] = t.str(r, "image");
        o["quantity"] = jnum(qty);
        o["unit_price"] = jnum(price);
        o["stock"] = jnum(stock);
        o["subtotal"] = jnum(price * qty);
        o["available"] = available;
        items.push_back(std::move(o));
        totalQty += qty;
        if (available) subtotal += price * qty;
    }
    json out = jobj();
    out["items"] = json(items);
    out["count"] = jnum(totalQty);
    out["subtotal_available"] = jnum(subtotal);
    return out;
}

// ---------- chat ----------
inline long long conversationAccess(Ctx& c, long long id) {
    Table t = c.db.query("SELECT id, customer_id FROM conversations WHERE id=?", {id});
    if (t.empty()) fail(404, "Percakapan tidak ditemukan");
    if (c.user.role != "seller" && t.i64(0, "customer_id") != c.user.id) fail(403, "Anda tidak berhak mengakses percakapan ini");
    return id;
}

inline void registerShopRoutes(crow::SimpleApp& app, AppState& st) {
    // ---------- keranjang ----------
    CROW_ROUTE(app, "/api/cart")([&st](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json { return cartJson(c); });
    });

    CROW_ROUTE(app, "/api/cart/items").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            long long vid = jInt(c.body(), "variant_id"), qty = jInt(c.body(), "quantity", 1);
            if (vid <= 0) fail(400, "Pilih varian produk terlebih dahulu");
            if (qty < 1 || qty > 99) fail(400, "Jumlah harus antara 1 dan 99");
            Table v = c.db.query(
                "SELECT v.stock, v.is_active, p.is_active AS p_active FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=?",
                {vid});
            if (v.empty() || v.i64(0, "is_active") != 1 || v.i64(0, "p_active") != 1) fail(404, "Varian produk tidak tersedia");
            long long stock = v.i64(0, "stock");
            long long cartId = cartIdOf(c.db, c.user.id);
            Table ex = c.db.query("SELECT id, quantity FROM cart_items WHERE cart_id=? AND variant_id=?", {cartId, vid});
            long long newQty = qty + (ex.empty() ? 0 : ex.i64(0, "quantity"));
            if (newQty > stock) fail(409, "Stok tidak cukup. Tersisa " + std::to_string(stock) + " unit");
            if (newQty > 99) fail(400, "Jumlah maksimal 99 per item");
            if (ex.empty()) c.db.exec("INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?,?,?)", {cartId, vid, newQty});
            else c.db.exec("UPDATE cart_items SET quantity=? WHERE id=?", {newQty, ex.i64(0, "id")});
            c.status = 201;
            return cartJson(c);
        });
    });

    CROW_ROUTE(app, "/api/cart/items/<int>").methods(crow::HTTPMethod::Put)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            long long qty = jInt(c.body(), "quantity", 0);
            if (qty < 1 || qty > 99) fail(400, "Jumlah harus antara 1 dan 99");
            long long cartId = cartIdOf(c.db, c.user.id);
            Table it = c.db.query(
                "SELECT v.stock FROM cart_items ci JOIN product_variants v ON v.id=ci.variant_id WHERE ci.id=? AND ci.cart_id=?",
                {id, cartId});
            if (it.empty()) fail(404, "Item keranjang tidak ditemukan");
            if (qty > it.i64(0, "stock")) fail(409, "Stok tidak cukup. Tersisa " + std::to_string(it.i64(0, "stock")) + " unit");
            c.db.exec("UPDATE cart_items SET quantity=? WHERE id=?", {qty, id});
            return cartJson(c);
        });
    });

    CROW_ROUTE(app, "/api/cart/items/<int>").methods(crow::HTTPMethod::Delete)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            long long cartId = cartIdOf(c.db, c.user.id);
            if (c.db.exec("DELETE FROM cart_items WHERE id=? AND cart_id=?", {id, cartId}) == 0) fail(404, "Item keranjang tidak ditemukan");
            return cartJson(c);
        });
    });

    // ---------- checkout: buat pesanan ----------
    CROW_ROUTE(app, "/api/orders").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            struct Line { long long vid = 0, qty = 0, cartItemId = 0; };
            std::vector<Line> lines;
            const rjson& b = c.body();
            const bool fromCart = jStr(b, "source", "direct") == "cart";
            if (fromCart) {
                if (!jIsList(b, "cart_item_ids") || b["cart_item_ids"].size() == 0) fail(400, "Pilih minimal satu item keranjang");
                for (const auto& v : b["cart_item_ids"]) {
                    if (v.t() != crow::json::type::Number) fail(400, "Daftar item keranjang tidak valid");
                    long long ciId = static_cast<long long>(v.d());
                    Table ci = c.db.query(
                        "SELECT ci.variant_id, ci.quantity FROM cart_items ci JOIN carts ct ON ct.id=ci.cart_id WHERE ci.id=? AND ct.user_id=?",
                        {ciId, c.user.id});
                    if (ci.empty()) fail(400, "Salah satu item keranjang tidak ditemukan");
                    lines.push_back({ci.i64(0, "variant_id"), ci.i64(0, "quantity"), ciId});
                }
            } else {
                if (!jIsList(b, "items") || b["items"].size() == 0) fail(400, "Item pesanan kosong");
                for (const auto& v : b["items"]) {
                    Line l;
                    l.vid = jInt(v, "variant_id");
                    l.qty = jInt(v, "quantity", 1);
                    lines.push_back(l);
                }
            }
            if (lines.size() > 30) fail(400, "Maksimal 30 item per pesanan");
            // gabungkan variant yang sama
            std::vector<Line> merged;
            for (const Line& l : lines) {
                if (l.vid <= 0 || l.qty < 1 || l.qty > 99) fail(400, "Varian atau jumlah item tidak valid");
                bool found = false;
                for (Line& m : merged)
                    if (m.vid == l.vid) {
                        m.qty += l.qty;
                        found = true;
                    }
                if (!found) merged.push_back(l);
            }

            // alamat
            std::string recipient, phone, addressText;
            if (jInt(b, "address_id") > 0) {
                Table a = c.db.query("SELECT recipient, phone, street, city, province, postal_code FROM addresses WHERE id=? AND user_id=?",
                                     {jInt(b, "address_id"), c.user.id});
                if (a.empty()) fail(400, "Alamat pengiriman tidak ditemukan");
                recipient = a.str(0, "recipient");
                phone = a.str(0, "phone");
                addressText = a.str(0, "street") + ", " + a.str(0, "city") + ", " + a.str(0, "province") + " " + a.str(0, "postal_code");
            } else if (jHas(b, "address") && b["address"].t() == crow::json::type::Object) {
                AddressInput a = readAddress(c, b["address"], c.user.name, "");
                recipient = a.recipient;
                phone = a.phone;
                addressText = a.street + ", " + a.city + ", " + a.province + " " + a.postal;
            } else {
                fail(400, "Alamat pengiriman wajib dipilih");
            }

            // pengiriman (tarif lokal dari database)
            Table ship = c.db.query(
                "SELECT s.id, s.name, r.base_cost, r.per_item_cost FROM shipping_services s JOIN shipping_rates r ON r.service_id=s.id "
                "WHERE s.id=? AND s.is_active=1",
                {jInt(b, "shipping_service_id")});
            if (ship.empty()) fail(400, "Pilih layanan pengiriman");

            // pembayaran simulasi
            std::string method = jStr(b, "payment_method");
            std::string bank = jStr(b, "bank");
            if (method != "QRIS" && method != "VA") fail(400, "Pilih metode pembayaran simulasi (QRIS atau Virtual Account)");
            if (method == "VA") {
                bool ok = false;
                for (const auto& s : simulatedBanks()) if (s == bank) ok = true;
                if (!ok) fail(400, "Pilih bank untuk Virtual Account simulasi");
            } else {
                bank.clear();
            }

            long long orderId = 0;
            std::string orderNo;
            {
                Tx tx(c.db);
                struct Info { long long vid, qty, price, pid; std::string pname, vname, image; };
                std::vector<Info> infos;
                long long subtotal = 0, totalQty = 0;
                for (const Line& l : merged) {
                    // harga dan stok SELALU diambil dari database dan dikunci (FOR UPDATE), bukan dari klien
                    Table v = c.db.query(
                        std::string("SELECT v.id, v.name AS vname, v.price, v.stock, v.is_active, p.id AS pid, p.name AS pname, "
                                    "p.is_active AS pactive, ") +
                            kImageSub +
                            " AS image FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? FOR UPDATE",
                        {l.vid});
                    if (v.empty() || v.i64(0, "is_active") != 1 || v.i64(0, "pactive") != 1) fail(409, "Ada produk yang sudah tidak tersedia");
                    std::string label = v.str(0, "pname") + " - " + v.str(0, "vname");
                    if (v.i64(0, "stock") < l.qty)
                        fail(409, "Stok \"" + label + "\" tidak cukup (tersisa " + std::to_string(v.i64(0, "stock")) + ")");
                    Info inf{l.vid, l.qty, v.i64(0, "price"), v.i64(0, "pid"), v.str(0, "pname"), v.str(0, "vname"), v.str(0, "image")};
                    subtotal += inf.price * inf.qty;
                    totalQty += inf.qty;
                    infos.push_back(inf);
                }
                long long shippingCost = ship.i64(0, "base_cost") + ship.i64(0, "per_item_cost") * totalQty;
                long long total = subtotal + shippingCost;

                std::time_t now = std::time(nullptr);
                char day[16] = "";
                std::tm* tmv = std::localtime(&now);
                if (tmv != nullptr) std::strftime(day, sizeof(day), "%Y%m%d", tmv);
                char tail[8];
                std::snprintf(tail, sizeof(tail), "%06lld", util::randomDigits(6));
                orderNo = std::string("RP-") + day + "-" + tail;

                c.db.exec(
                    "INSERT INTO orders (order_no, user_id, recipient, phone, address_text, shipping_service_id, shipping_name, subtotal, "
                    "shipping_cost, total, status) VALUES (?,?,?,?,?,?,?,?,?,?, 'Menunggu Pembayaran')",
                    {orderNo, c.user.id, recipient, phone, addressText, ship.i64(0, "id"), ship.str(0, "name"), subtotal, shippingCost, total});
                orderId = c.db.insertId();
                for (const Info& inf : infos) {
                    c.db.exec("INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, image_path, unit_price, quantity) "
                              "VALUES (?,?,?,?,?,?,?,?)",
                              {orderId, inf.pid, inf.vid, inf.pname, inf.vname, inf.image, inf.price, inf.qty});
                    if (c.db.exec("UPDATE product_variants SET stock=stock-? WHERE id=? AND stock>=?", {inf.qty, inf.vid, inf.qty}) != 1)
                        fail(409, "Stok \"" + inf.pname + "\" berubah, silakan coba lagi");
                    c.db.exec("INSERT INTO inventory_movements (variant_id, delta, reason, order_id) VALUES (?,?,?,?)",
                              {inf.vid, -inf.qty, "order", orderId});
                }
                std::string reference;
                if (method == "VA") {
                    char buf[24];
                    std::snprintf(buf, sizeof(buf), "8808%012lld", util::randomDigits(12));  // selalu 16 digit
                    reference = buf;
                } else {
                    reference = "QRIS-SIM-" + util::randomHex(6);
                }
                c.db.exec(std::string("INSERT INTO payments (order_id, method, bank, reference, amount, status, expires_at) VALUES "
                                      "(?,?,?,?,?, 'Menunggu Pembayaran', DATE_ADD(NOW(), INTERVAL ") +
                              std::to_string(kPaymentExpiryMinutes) + " MINUTE))",
                          {orderId, method, bank.empty() ? Param(nullptr) : Param(bank), reference, total});
                addOrderEvent(c.db, orderId, "Menunggu Pembayaran", "Pesanan dibuat, menunggu pembayaran simulasi", c.user.id);
                if (fromCart)
                    for (const Line& l : lines) c.db.exec("DELETE FROM cart_items WHERE id=?", {l.cartItemId});
                tx.commit();
            }
            c.status = 201;
            json o = jobj();
            o["id"] = jnum(orderId);
            o["order_no"] = orderNo;
            return o;
        });
    });

    CROW_ROUTE(app, "/api/orders")([&st](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            expireStaleOrders(c.db);
            return orderList(c.db, c.user.id, "");
        });
    });

    CROW_ROUTE(app, "/api/orders/<int>")([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            expireStaleOrders(c.db);
            return orderDetail(c.db, id, c.user.id);
        });
    });

    CROW_ROUTE(app, "/api/orders/<int>/cancel").methods(crow::HTTPMethod::Post)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            expireStaleOrders(c.db);
            Table o = c.db.query("SELECT status FROM orders WHERE id=? AND user_id=?", {id, c.user.id});
            if (o.empty()) fail(404, "Pesanan tidak ditemukan");
            if (o.str(0, "status") != "Menunggu Pembayaran") fail(409, "Hanya pesanan yang belum dibayar yang dapat dibatalkan");
            Tx tx(c.db);
            c.db.exec("UPDATE orders SET status='Dibatalkan' WHERE id=?", {id});
            restockOrder(c.db, id, "cancel");
            c.db.exec("UPDATE payments SET status='Gagal' WHERE order_id=?", {id});
            addOrderEvent(c.db, id, "Dibatalkan", "Dibatalkan oleh pelanggan, stok dikembalikan", c.user.id);
            tx.commit();
            return orderDetail(c.db, id, c.user.id);
        });
    });

    CROW_ROUTE(app, "/api/orders/<int>/received").methods(crow::HTTPMethod::Post)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            Table o = c.db.query("SELECT status FROM orders WHERE id=? AND user_id=?", {id, c.user.id});
            if (o.empty()) fail(404, "Pesanan tidak ditemukan");
            if (o.str(0, "status") != "Dalam Pengiriman") fail(409, "Konfirmasi hanya bisa dilakukan saat pesanan dalam pengiriman");
            Tx tx(c.db);
            c.db.exec("UPDATE orders SET status='Diterima' WHERE id=?", {id});
            addOrderEvent(c.db, id, "Diterima", "Pesanan dikonfirmasi diterima oleh pelanggan", c.user.id);
            tx.commit();
            return orderDetail(c.db, id, c.user.id);
        });
    });

    // ---------- pembayaran SIMULASI ----------
    CROW_ROUTE(app, "/api/payments/simulate").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            long long orderId = jInt(c.body(), "order_id");
            std::string result = jStr(c.body(), "result");
            if (result != "success" && result != "fail") fail(400, "Hasil simulasi harus success atau fail");
            expireStaleOrders(c.db);
            Table o = c.db.query("SELECT status FROM orders WHERE id=? AND user_id=?", {orderId, c.user.id});
            if (o.empty()) fail(404, "Pesanan tidak ditemukan");
            Table pay = c.db.query("SELECT status FROM payments WHERE order_id=?", {orderId});
            if (pay.empty()) fail(404, "Data pembayaran tidak ditemukan");
            if (pay.str(0, "status") == "Berhasil") fail(409, "Pembayaran simulasi sudah berhasil");
            if (o.str(0, "status") != "Menunggu Pembayaran") fail(409, "Pesanan ini sudah tidak menunggu pembayaran (dibatalkan atau kedaluwarsa)");
            Tx tx(c.db);
            if (result == "success") {
                c.db.exec("UPDATE payments SET status='Berhasil', paid_at=NOW() WHERE order_id=?", {orderId});
                c.db.exec("UPDATE orders SET status='Dibayar', paid_at=NOW() WHERE id=?", {orderId});
                Table items = c.db.query("SELECT product_id, quantity FROM order_items WHERE order_id=? AND product_id IS NOT NULL", {orderId});
                for (size_t i = 0; i < items.size(); ++i)
                    c.db.exec("UPDATE products SET sold_count=sold_count+? WHERE id=?", {items.i64(i, "quantity"), items.i64(i, "product_id")});
                addOrderEvent(c.db, orderId, "Dibayar", "Pembayaran simulasi berhasil (bukan transaksi uang sungguhan)", c.user.id);
            } else {
                c.db.exec("UPDATE payments SET status='Gagal' WHERE order_id=?", {orderId});
            }
            tx.commit();
            return orderDetail(c.db, orderId, c.user.id);
        });
    });

    // ---------- ulasan ----------
    CROW_ROUTE(app, "/api/products/<int>/reviews").methods(crow::HTTPMethod::Post)([&st](const crow::request& req, int pid) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            long long orderId = jInt(c.body(), "order_id"), rating = jInt(c.body(), "rating");
            std::string comment = util::trim(jStr(c.body(), "comment"));
            if (rating < 1 || rating > 5) fail(400, "Rating harus 1 sampai 5 bintang");
            if (comment.size() > 1000) fail(400, "Komentar maksimal 1000 karakter");
            Table o = c.db.query(
                "SELECT o.status FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.id=? AND o.user_id=? AND oi.product_id=? LIMIT 1",
                {orderId, c.user.id, pid});
            if (o.empty()) fail(403, "Pesanan tidak ditemukan atau tidak memuat produk ini");
            if (o.str(0, "status") != "Diterima" && o.str(0, "status") != "Selesai")
                fail(403, "Ulasan hanya dapat diberikan setelah pesanan diterima");
            if (!c.db.query("SELECT id FROM reviews WHERE order_id=? AND product_id=?", {orderId, pid}).empty())
                fail(409, "Anda sudah memberi ulasan untuk produk ini pada pesanan tersebut");
            c.db.exec("INSERT INTO reviews (product_id, order_id, user_id, rating, comment) VALUES (?,?,?,?,?)",
                      {pid, orderId, c.user.id, rating, comment});
            c.status = 201;
            return reviewsOf(c.db, pid);
        });
    });

    // ---------- chat (polling) ----------
    CROW_ROUTE(app, "/api/conversations")([&st](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            std::string sql =
                "SELECT cv.id, cv.subject, cv.order_id, COALESCE(o.order_no,'') AS order_no, u.name AS customer_name, "
                "DATE_FORMAT(cv.last_message_at,'%d %b %H:%i') AS last_at, "
                "COALESCE((SELECT body FROM messages m WHERE m.conversation_id=cv.id ORDER BY m.id DESC LIMIT 1),'') AS last_message "
                "FROM conversations cv JOIN users u ON u.id=cv.customer_id LEFT JOIN orders o ON o.id=cv.order_id ";
            Params p;
            if (c.user.role != "seller") {
                sql += "WHERE cv.customer_id=? ";
                p.push_back(c.user.id);
            }
            sql += "ORDER BY cv.last_message_at DESC, cv.id DESC";
            return tableJson(c.db.query(sql, p));
        });
    });

    CROW_ROUTE(app, "/api/conversations").methods(crow::HTTPMethod::Post)([&st](const crow::request& req) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            if (c.user.role == "seller") fail(403, "Penjual membalas dari daftar percakapan pelanggan");
            std::string message = c.needStr("message", "Pesan", 1, 1000);
            long long orderId = jInt(c.body(), "order_id", 0);
            std::string subject = "Pertanyaan umum";
            if (orderId > 0) {
                Table o = c.db.query("SELECT order_no FROM orders WHERE id=? AND user_id=?", {orderId, c.user.id});
                if (o.empty()) fail(404, "Pesanan tidak ditemukan");
                subject = "Pesanan " + o.str(0, "order_no");
            }
            Table ex = orderId > 0 ? c.db.query("SELECT id FROM conversations WHERE customer_id=? AND order_id=?", {c.user.id, orderId})
                                   : c.db.query("SELECT id FROM conversations WHERE customer_id=? AND order_id IS NULL", {c.user.id});
            Tx tx(c.db);
            long long convId;
            if (ex.empty()) {
                c.db.exec("INSERT INTO conversations (customer_id, order_id, subject, last_message_at) VALUES (?,?,?,NOW())",
                          {c.user.id, orderId > 0 ? Param(orderId) : Param(nullptr), subject});
                convId = c.db.insertId();
            } else {
                convId = ex.i64(0, "id");
            }
            c.db.exec("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)", {convId, c.user.id, message});
            c.db.exec("UPDATE conversations SET last_message_at=NOW() WHERE id=?", {convId});
            tx.commit();
            c.status = 201;
            json o = jobj();
            o["id"] = jnum(convId);
            return o;
        });
    });

    CROW_ROUTE(app, "/api/conversations/<int>/messages")([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            conversationAccess(c, id);
            Table conv = c.db.query("SELECT cv.subject, u.name AS customer_name FROM conversations cv JOIN users u ON u.id=cv.customer_id WHERE cv.id=?", {id});
            json o = jobj();
            o["subject"] = conv.str(0, "subject");
            o["customer_name"] = conv.str(0, "customer_name");
            o["messages"] = tableJson(c.db.query(
                "SELECT m.id, m.body, m.sender_id, u.name AS sender_name, u.role AS sender_role, "
                "DATE_FORMAT(m.created_at,'%d %b %H:%i') AS created_at FROM messages m JOIN users u ON u.id=m.sender_id "
                "WHERE m.conversation_id=? AND m.id>? ORDER BY m.id",
                {id, c.queryInt("after", 0)}));
            return o;
        });
    });

    CROW_ROUTE(app, "/api/conversations/<int>/messages").methods(crow::HTTPMethod::Post)([&st](const crow::request& req, int id) {
        return run(st, req, Auth::Customer, [&](Ctx& c) -> json {
            conversationAccess(c, id);
            std::string body = c.needStr("body", "Pesan", 1, 1000);
            Tx tx(c.db);
            c.db.exec("INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)", {id, c.user.id, body});
            c.db.exec("UPDATE conversations SET last_message_at=NOW() WHERE id=?", {id});
            tx.commit();
            c.status = 201;
            json o = jobj();
            o["ok"] = true;
            return o;
        });
    });
}
