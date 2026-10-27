// db.hpp - pembungkus MySQL Connector/C++ (API legacy). Semua query memakai prepared statement + parameter binding.
#pragma once
#include <cstdlib>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <cppconn/connection.h>
#include <cppconn/driver.h>
#include <cppconn/exception.h>
#include <cppconn/metadata.h>
#include <cppconn/prepared_statement.h>
#include <cppconn/resultset.h>
#include <cppconn/resultset_metadata.h>
#include <cppconn/statement.h>
#include <mysql_connection.h>
#include <mysql_driver.h>

struct Cell {
    std::string s;
    bool null = false;
    bool num = false;
};

struct Table {
    std::vector<std::string> cols;
    std::vector<std::vector<Cell>> rows;
    std::unordered_map<std::string, size_t> idx;

    size_t size() const { return rows.size(); }
    bool empty() const { return rows.empty(); }
    const Cell& cell(size_t r, const std::string& c) const {
        static const Cell none;
        auto it = idx.find(c);
        if (it == idx.end() || r >= rows.size()) return none;
        return rows[r][it->second];
    }
    std::string str(size_t r, const std::string& c) const { return cell(r, c).s; }
    long long i64(size_t r, const std::string& c) const {
        const Cell& x = cell(r, c);
        return (x.null || x.s.empty()) ? 0 : std::atoll(x.s.c_str());
    }
    double dbl(size_t r, const std::string& c) const {
        const Cell& x = cell(r, c);
        return (x.null || x.s.empty()) ? 0.0 : std::atof(x.s.c_str());
    }
    bool isNull(size_t r, const std::string& c) const { return cell(r, c).null; }
};

struct Param {
    enum Kind { Null, Int, Dbl, Str } k = Null;
    long long i = 0;
    double d = 0;
    std::string s;
    Param() = default;
    Param(std::nullptr_t) {}
    Param(int v) : k(Int), i(v) {}
    Param(long long v) : k(Int), i(v) {}
    Param(double v) : k(Dbl), d(v) {}
    Param(const std::string& v) : k(Str), s(v) {}
    Param(const char* v) : k(Str), s(v) {}
};
using Params = std::vector<Param>;

class Db {
public:
    struct Settings {
        std::string host = "127.0.0.1";
        int port = 3306;
        std::string user = "root";
        std::string pass;
        std::string name = "raceparts_db";
    };

    explicit Db(Settings s) : cfg_(std::move(s)) {}

    void connect() {
        sql::mysql::MySQL_Driver* driver = sql::mysql::get_driver_instance();
        std::string url = "tcp://" + cfg_.host + ":" + std::to_string(cfg_.port);
        conn_.reset(driver->connect(url, cfg_.user, cfg_.pass));
        conn_->setSchema(cfg_.name);
        std::unique_ptr<sql::Statement> st(conn_->createStatement());
        st->execute("SET NAMES utf8mb4");
        inTx_ = false;
    }

    bool ping() {
        try {
            query("SELECT 1 AS ok");
            return true;
        } catch (...) {
            return false;
        }
    }

    Table query(const std::string& sqlText, const Params& params = {}) {
        return withRetry([&]() -> Table {
            std::unique_ptr<sql::PreparedStatement> ps(conn_->prepareStatement(sqlText));
            bind(ps.get(), params);
            std::unique_ptr<sql::ResultSet> rs(ps->executeQuery());
            Table t;
            sql::ResultSetMetaData* md = rs->getMetaData();
            unsigned n = md->getColumnCount();
            std::vector<bool> numeric(n, false);
            for (unsigned c = 1; c <= n; ++c) {
                std::string label = md->getColumnLabel(c).asStdString();
                t.idx[label] = c - 1;
                t.cols.push_back(label);
                switch (md->getColumnType(c)) {
                    case sql::DataType::TINYINT:
                    case sql::DataType::SMALLINT:
                    case sql::DataType::MEDIUMINT:
                    case sql::DataType::INTEGER:
                    case sql::DataType::BIGINT:
                    case sql::DataType::DECIMAL:
                    case sql::DataType::NUMERIC:
                    case sql::DataType::REAL:
                    case sql::DataType::DOUBLE:
                        numeric[c - 1] = true;
                        break;
                    default:
                        break;
                }
            }
            while (rs->next()) {
                std::vector<Cell> row(n);
                for (unsigned c = 1; c <= n; ++c) {
                    Cell& cell = row[c - 1];
                    cell.null = rs->isNull(c);
                    cell.num = numeric[c - 1];
                    if (!cell.null) cell.s = rs->getString(c).asStdString();
                }
                t.rows.push_back(std::move(row));
            }
            return t;
        });
    }

    // INSERT/UPDATE/DELETE: mengembalikan jumlah baris terpengaruh
    long long exec(const std::string& sqlText, const Params& params = {}) {
        return withRetry([&]() -> long long {
            std::unique_ptr<sql::PreparedStatement> ps(conn_->prepareStatement(sqlText));
            bind(ps.get(), params);
            return static_cast<long long>(ps->executeUpdate());
        });
    }

    long long insertId() {
        Table t = query("SELECT LAST_INSERT_ID() AS id");
        return t.empty() ? 0 : t.i64(0, "id");
    }

    void begin() {
        ensure();
        conn_->setAutoCommit(false);
        inTx_ = true;
    }
    void commit() {
        conn_->commit();
        conn_->setAutoCommit(true);
        inTx_ = false;
    }
    void rollback() {
        try {
            if (conn_) {
                conn_->rollback();
                conn_->setAutoCommit(true);
            }
        } catch (...) {
        }
        inTx_ = false;
    }

private:
    Settings cfg_;
    std::unique_ptr<sql::Connection> conn_;
    bool inTx_ = false;

    void ensure() {
        if (!conn_) connect();
    }

    template <class F>
    auto withRetry(F f) -> decltype(f()) {
        ensure();
        try {
            return f();
        } catch (sql::SQLException& e) {
            int c = e.getErrorCode();
            bool lost = (c == 2006 || c == 2013 || c == 2055);  // koneksi terputus
            if (lost && !inTx_) {
                conn_.reset();
                ensure();
                return f();
            }
            throw;
        }
    }

    static void bind(sql::PreparedStatement* ps, const Params& p) {
        for (size_t i = 0; i < p.size(); ++i) {
            unsigned idx = static_cast<unsigned>(i + 1);
            switch (p[i].k) {
                case Param::Null: ps->setNull(idx, sql::DataType::VARCHAR); break;
                case Param::Int: ps->setInt64(idx, p[i].i); break;
                case Param::Dbl: ps->setDouble(idx, p[i].d); break;
                case Param::Str: ps->setString(idx, p[i].s); break;
            }
        }
    }
};

// Transaksi RAII: otomatis rollback bila commit() tidak dipanggil (misalnya karena exception)
class Tx {
public:
    explicit Tx(Db& db) : db_(db) { db_.begin(); }
    void commit() {
        db_.commit();
        done_ = true;
    }
    ~Tx() {
        if (!done_) db_.rollback();
    }
    Tx(const Tx&) = delete;
    Tx& operator=(const Tx&) = delete;

private:
    Db& db_;
    bool done_ = false;
};
