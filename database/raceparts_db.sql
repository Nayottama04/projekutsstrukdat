-- ==========================================================
-- RaceParts - database lokal (MySQL / MariaDB via XAMPP)
-- Cara impor: phpMyAdmin > Import > pilih file ini > Go
-- atau terminal: mysql -u root < database/raceparts_db.sql
-- ==========================================================
CREATE DATABASE IF NOT EXISTS raceparts_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE raceparts_db;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS algorithm_logs;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS shipment_events;
DROP TABLE IF EXISTS shipments;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS shipping_rates;
DROP TABLE IF EXISTS shipping_services;
DROP TABLE IF EXISTS cart_items;
DROP TABLE IF EXISTS carts;
DROP TABLE IF EXISTS product_images;
DROP TABLE IF EXISTS product_motor_compatibilities;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS motor_models;
DROP TABLE IF EXISTS motor_brands;
DROP TABLE IF EXISTS aftermarket_brands;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;


CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(30) NOT NULL UNIQUE,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  role ENUM('customer','seller') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  label VARCHAR(40) NOT NULL DEFAULT 'Rumah',
  recipient VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  street VARCHAR(255) NOT NULL,
  city VARCHAR(80) NOT NULL,
  province VARCHAR(80) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE aftermarket_brands (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE) ENGINE=InnoDB;
CREATE TABLE motor_brands (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE) ENGINE=InnoDB;
CREATE TABLE motor_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  motor_brand_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_model (motor_brand_id, name),
  FOREIGN KEY (motor_brand_id) REFERENCES motor_brands(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  specs TEXT,
  category_id INT NOT NULL,
  brand_id INT NOT NULL,
  sold_count INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_products_cat (category_id),
  INDEX idx_products_brand (brand_id),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (brand_id) REFERENCES aftermarket_brands(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE product_variants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  sku VARCHAR(40) NOT NULL UNIQUE,
  price BIGINT NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_variants_product (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_motor_compatibilities (
  product_id INT NOT NULL,
  motor_model_id INT NOT NULL,
  PRIMARY KEY (product_id, motor_model_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (motor_model_id) REFERENCES motor_models(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  path VARCHAR(255) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cart_id INT NOT NULL,
  variant_id INT NOT NULL,
  quantity INT NOT NULL,
  UNIQUE KEY uq_cart_variant (cart_id, variant_id),
  FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE shipping_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(160) NOT NULL,
  eta_text VARCHAR(60) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE shipping_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL UNIQUE,
  base_cost BIGINT NOT NULL,
  per_item_cost BIGINT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES shipping_services(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(30) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  recipient VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address_text VARCHAR(500) NOT NULL,
  shipping_service_id INT NULL,
  shipping_name VARCHAR(80) NOT NULL,
  subtotal BIGINT NOT NULL,
  shipping_cost BIGINT NOT NULL,
  total BIGINT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Menunggu Pembayaran',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at DATETIME NULL,
  INDEX idx_orders_user (user_id),
  INDEX idx_orders_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Snapshot: nama/harga disalin saat pesanan dibuat agar riwayat tidak berubah ketika katalog diedit
CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  variant_id INT NULL,
  product_name VARCHAR(160) NOT NULL,
  variant_name VARCHAR(80) NOT NULL,
  image_path VARCHAR(255) NOT NULL DEFAULT '',
  unit_price BIGINT NOT NULL,
  quantity INT NOT NULL,
  INDEX idx_oi_product (product_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  method VARCHAR(10) NOT NULL,
  bank VARCHAR(30) NULL,
  reference VARCHAR(60) NOT NULL,
  amount BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Menunggu Pembayaran',
  expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE shipments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  courier VARCHAR(60) NOT NULL DEFAULT '',
  tracking_no VARCHAR(80) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE shipment_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status VARCHAR(40) NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  actor_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_order (order_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review (order_id, product_id),
  INDEX idx_reviews_product (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_id INT NULL,
  subject VARCHAR(150) NOT NULL,
  last_message_at DATETIME NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_conv (conversation_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  variant_id INT NOT NULL,
  delta INT NOT NULL,
  reason VARCHAR(40) NOT NULL,
  order_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inv_variant (variant_id)
) ENGINE=InnoDB;

CREATE TABLE algorithm_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(10) NOT NULL,
  method VARCHAR(40) NOT NULL,
  criteria VARCHAR(60) NULL,
  keyword VARCHAR(120) NULL,
  item_count INT NOT NULL DEFAULT 0,
  comparisons INT NOT NULL DEFAULT 0,
  swaps INT NOT NULL DEFAULT 0,
  items_checked INT NOT NULL DEFAULT 0,
  found TINYINT(1) NULL,
  log_text MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ================= DATA DEMO =================
-- Akun demo (password ada di README): penjual / pelanggan / rizky
INSERT INTO users (id,name,username,phone,email,password_hash,role) VALUES (1,'Penjual RaceParts','penjual','081200000001','penjual@raceparts.local','pbkdf2$20000$fe05123e630f25433349e5f7ca27b15d$265ea330598e0b4b17a193b31fa5fb5960de5fe25ef30d69b2f5632fe6c82be9','seller');
INSERT INTO users (id,name,username,phone,email,password_hash,role) VALUES (2,'Dimas Pratama','pelanggan','081200000002','pelanggan@raceparts.local','pbkdf2$20000$8468dbcdb6f2a9e135595e3912cc8f51$9c711f43692c0b13dc3cc2a387dcb9bb8dcf4fdc6c388025dfcde8b8a50a32a3','customer');
INSERT INTO users (id,name,username,phone,email,password_hash,role) VALUES (3,'Rizky Ananda','rizky','081200000003','rizky@raceparts.local','pbkdf2$20000$1b7abd95b7c1e765ed671e1749fcc4ec$bd288c206c70d8aecd52643902e565e2697d51700e9af80059916f43d9e690fc','customer');
INSERT INTO addresses (user_id,label,recipient,phone,street,city,province,postal_code,is_default) VALUES
 (2,'Rumah','Dimas Pratama','081200000002','Jl. Melati No. 14, RT 03/RW 05','Bandung','Jawa Barat','40115',1),
 (3,'Rumah','Rizky Ananda','081200000003','Jl. Kenanga Raya No. 8','Semarang','Jawa Tengah','50241',1);
INSERT INTO carts (user_id) VALUES (1),(2),(3);
INSERT INTO aftermarket_brands (id,name) VALUES (1,'Brembo'),(2,'NGK'),(3,'RCB'),(4,'Yoshimura'),(5,'KYB'),(6,'DID'),(7,'Michelin'),(8,'Pirelli'),(9,'Koso'),(10,'Daytona'),(11,'KYT'),(12,'Alpinestars');
INSERT INTO motor_brands (id,name) VALUES (1,'Honda'),(2,'Yamaha'),(3,'Suzuki'),(4,'Kawasaki');
INSERT INTO motor_models (id,motor_brand_id,name) VALUES (1,1,'Vario 160'),(2,1,'PCX 160'),(3,1,'CBR150R'),(4,1,'CB150R'),(5,1,'Beat'),(6,2,'NMAX'),(7,2,'Aerox 155'),(8,2,'R15'),(9,2,'MT-15'),(10,2,'Vixion'),(11,3,'GSX-R150'),(12,3,'GSX-S150'),(13,4,'Ninja 250'),(14,4,'KLX 150'),(15,4,'Ninja ZX-25R');
INSERT INTO categories (id,name,slug) VALUES (1,'Mesin','mesin'),(2,'Kelistrikan','kelistrikan'),(3,'Pengereman','pengereman'),(4,'Suspensi','suspensi'),(5,'Drivetrain','drivetrain'),(6,'Ban','ban'),(7,'Aksesori','aksesori'),(8,'Perlengkapan Racing','perlengkapan-racing');

-- Produk
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (1,'Kampas Rem Racing Depan','Kampas rem sintered dengan gigitan awal tegas dan tahan panas pada pengereman berulang di lintasan maupun jalan raya.','Material: Sintered metal
Suhu kerja: hingga 650 C
Posisi: Roda depan
Garansi: 30 hari',3,1,142,1,DATE_SUB(NOW(), INTERVAL 40 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (1,1,'CBR150R / CB150R','BRM-KR-HND',285000,24,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (1,24,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (2,1,'R15 / MT-15 / Vixion','BRM-KR-YMH',285000,18,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (2,18,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (1,'/img/pengereman.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (1,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (1,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (1,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (1,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (1,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (2,'Cakram Rem Floating 260 mm','Cakram floating dua bagian dengan lubang pendingin. Bobot lebih ringan dari cakram standar dan lebih tahan melengkung.','Diameter: 260 mm
Material: Stainless steel
Tebal: 4 mm
Pengikat: 6 baut',3,3,64,1,DATE_SUB(NOW(), INTERVAL 35 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (3,2,'Hitam','RCB-CK-260-BK',1250000,8,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (3,8,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (4,2,'Silver','RCB-CK-260-SL',1250000,5,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (4,5,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (2,'/img/pengereman.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (2,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (2,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (2,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (2,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (2,10);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (2,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (2,12);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (3,'Master Rem Radial 19 mm','Master rem radial dengan tuas lipat yang bisa diatur jaraknya. Memberi feel pengereman progresif dan konsisten.','Piston: 19 mm
Material: Aluminium CNC
Reservoir: Terpisah
Tuas: Adjustable',3,1,38,1,DATE_SUB(NOW(), INTERVAL 30 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (5,3,'Hitam','BRM-MR-19-BK',2450000,6,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (5,6,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (6,3,'Titanium','BRM-MR-19-TI',2650000,3,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (6,3,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (3,'/img/pengereman.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (3,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (3,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (3,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (3,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (3,13);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (3,15);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (4,'Selang Rem Braided Stainless','Selang rem berlapis anyaman stainless yang tidak mengembang saat ditekan, sehingga tuas terasa lebih keras dan responsif.','Material: PTFE + stainless braid
Panjang depan: 80 cm
Panjang belakang: 70 cm
Fitting: Banjo aluminium',3,10,91,1,DATE_SUB(NOW(), INTERVAL 28 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (7,4,'Depan','DAY-SR-F',245000,12,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (7,12,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (8,4,'Belakang','DAY-SR-R',195000,14,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (8,14,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (4,'/img/pengereman.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,7);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,10);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,12);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (4,13);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (5,'Busi Iridium','Busi elektroda iridium untuk pengapian stabil dan start lebih mudah, cocok untuk motor yang sudah di-upgrade ringan.','Elektroda: Iridium 0,6 mm
Rentang panas: 8-9
Ulir: 10 mm
Isi: 1 pcs',2,2,260,1,DATE_SUB(NOW(), INTERVAL 45 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (9,5,'CR9EIX','NGK-CR9EIX',105000,60,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (9,60,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (10,5,'CPR8EIX-9','NGK-CPR8EIX9',98000,45,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (10,45,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (5,'/img/kelistrikan.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,7);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (5,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (6,'CDI Programmable Racing','CDI dengan peta pengapian yang bisa diatur. Membuang batas putaran mesin standar untuk penggunaan racing.','Rev limiter: Adjustable
Mode: 3 peta pengapian
Konektor: Plug and play
Tahan air: Ya',2,9,47,1,DATE_SUB(NOW(), INTERVAL 22 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (11,6,'Vario / Beat','KSO-CDI-HND',650000,10,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (11,10,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (12,6,'Aerox / NMAX','KSO-CDI-YMH',650000,7,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (12,7,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (6,'/img/kelistrikan.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (6,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (6,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (6,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (6,7);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (7,'Koil Racing Universal','Koil tegangan tinggi dengan kabel busi silikon. Percikan lebih kuat dan stabil pada putaran tinggi.','Tegangan: 30.000 V
Kabel: Silikon 7 mm
Pemasangan: Universal
Warna: Biru',2,10,83,1,DATE_SUB(NOW(), INTERVAL 18 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (13,7,'Universal','DAY-KOIL-UNI',185000,20,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (13,20,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (7,'/img/kelistrikan.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,7);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (7,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (8,'Piston Kit Racing','Set piston forged lengkap dengan ring dan pen. Rasio kompresi tinggi untuk bore up ringan.','Bahan: Forged aluminium
Rasio kompresi: 12,5:1
Isi: Piston, ring, pen, clip
Ukuran: 62 mm / 63 mm',1,3,29,1,DATE_SUB(NOW(), INTERVAL 15 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (14,8,'62 mm','RCB-PST-62',785000,9,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (14,9,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (15,8,'63 mm','RCB-PST-63',815000,7,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (15,7,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (8,'/img/mesin.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (8,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (8,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (8,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (8,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (9,'Knalpot Slip-On Titanium','Knalpot slip-on titanium dengan suara dalam dan lebih ringan sekitar 2 kg dari knalpot standar.','Material: Titanium + stainless
Bobot: 1,9 kg
Diameter inlet: 51 mm
DB killer: Termasuk',1,4,21,1,DATE_SUB(NOW(), INTERVAL 12 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (16,9,'R-77 Titanium','YSH-R77-TI',4850000,4,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (16,4,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (17,9,'R-77 Carbon Cap','YSH-R77-CF',5150000,3,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (17,3,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (9,'/img/mesin.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (9,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (9,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (9,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (9,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (9,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (9,12);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (10,'Filter Udara Racing','Filter udara busa dua lapis yang bisa dicuci ulang. Aliran udara lebih lancar dan tetap menyaring debu.','Bahan: Busa dua lapis
Dapat dicuci: Ya
Pemasangan: Pengganti filter standar
Jenis: Honda / Yamaha',1,10,120,1,DATE_SUB(NOW(), INTERVAL 10 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (18,10,'Honda','DAY-FU-HND',175000,30,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (18,30,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (19,10,'Yamaha','DAY-FU-YMH',175000,26,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (19,26,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (10,'/img/mesin.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,7);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (10,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (11,'Camshaft Racing','Noken as dengan durasi 260 derajat untuk tenaga di putaran atas. Disarankan dipasang bersama per klep racing.','Durasi: 260 derajat
Lift: 9,2 mm
Material: Baja karbon, heat treated
Catatan: Perlu penyetelan klep',1,3,17,1,DATE_SUB(NOW(), INTERVAL 8 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (20,11,'Durasi 260','RCB-CAM-260',1150000,6,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (20,6,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (11,'/img/mesin.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (11,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (11,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (11,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (11,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (12,'Shockbreaker Belakang 330 mm','Shockbreaker belakang dengan preload yang bisa diatur dan peredam kejut stabil untuk berkendara harian maupun sport.','Panjang: 330 mm
Preload: 5 tingkat
Tabung: Gas nitrogen
Beban maksimal: 150 kg',4,5,76,1,DATE_SUB(NOW(), INTERVAL 26 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (21,12,'Hitam','KYB-SB-330-BK',725000,12,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (21,12,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (22,12,'Merah','KYB-SB-330-RD',725000,9,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (22,9,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (12,'/img/suspensi.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (12,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (12,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (12,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (12,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (12,7);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (13,'Per Fork Progresif','Per fork progresif yang mengurangi dive saat pengereman keras tanpa membuat suspensi terlalu keras di jalan biasa.','Tipe: Progresif
Kekerasan: Soft atau Hard
Material: Pegas baja silikon
Isi: 1 set',4,5,33,1,DATE_SUB(NOW(), INTERVAL 20 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (23,13,'Soft','KYB-PF-S',425000,10,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (23,10,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (24,13,'Hard','KYB-PF-H',425000,8,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (24,8,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (13,'/img/suspensi.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (13,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (13,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (13,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (13,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (13,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (14,'Shockbreaker Tabung Atas','Shockbreaker tabung terpisah dengan kontrol rebound dan kompresi. Cocok untuk skuter yang sering membawa beban.','Panjang: 300-330 mm
Rebound: 12 klik
Tabung: Terpisah
Warna: Hitam',4,3,25,1,DATE_SUB(NOW(), INTERVAL 16 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (25,14,'Hitam','RCB-STA-BK',1150000,8,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (25,8,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (14,'/img/suspensi.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (14,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (14,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (14,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (14,7);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (15,'Rantai Racing 520','Rantai 520 dengan o-ring yang lebih ringan dan tahan regang dibanding rantai 428 standar. Perlu ganti gir set.','Tipe: 520VX3 o-ring
Beban putus: 3.100 kg
Warna: Emas
Isi: 1 rantai + clip',5,6,36,1,DATE_SUB(NOW(), INTERVAL 24 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (26,15,'520VX3 - 114 mata','DID-520-114',1390000,7,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (26,7,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (27,15,'520VX3 - 120 mata','DID-520-120',1450000,10,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (27,10,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (15,'/img/drivetrain.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (15,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (15,12);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (15,13);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (15,15);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (16,'Gir Set Racing','Gir depan dan belakang dari baja dengan pelapis anti karat. Rasio bisa dipilih untuk akselerasi atau kecepatan puncak.','Material: Baja + anodize aluminium
Pitch: 428
Rasio: 14/42 atau 15/44
Isi: Gir depan dan belakang',5,3,52,1,DATE_SUB(NOW(), INTERVAL 19 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (28,16,'14T / 42T','RCB-GS-1442',560000,15,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (28,15,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (29,16,'15T / 44T','RCB-GS-1544',575000,11,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (29,11,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (16,'/img/drivetrain.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (16,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (16,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (16,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (16,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (16,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (17,'Roller CVT Set','Roller CVT satu set enam buah untuk mengatur akselerasi skuter matic. Bobot beda memberi karakter tarikan berbeda.','Jumlah: 6 pcs
Bahan: Resin tahan panas
Bobot: 10 gram atau 12 gram
Pemasangan: Ganti roller standar',5,10,188,1,DATE_SUB(NOW(), INTERVAL 14 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (30,17,'10 gram','DAY-RLR-10',125000,40,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (30,40,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (31,17,'12 gram','DAY-RLR-12',125000,32,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (31,32,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (17,'/img/drivetrain.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (17,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (17,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (17,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (17,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (17,7);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (18,'Ban Depan Sport','Ban sport dengan grip basah yang baik dan umur pakai panjang. Cocok untuk harian dan track day ringan.','Tipe: Tubeless
Pola: Sport touring
Indeks beban: 54-58
Ukuran: 100/80-17 atau 120/70-17',6,7,44,1,DATE_SUB(NOW(), INTERVAL 11 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (32,18,'100/80-17','MCH-PS2-10080',685000,10,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (32,10,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (33,18,'120/70-17','MCH-PS2-12070',1150000,6,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (33,6,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (18,'/img/ban.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (18,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (18,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (18,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (18,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (18,10);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (18,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (18,12);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (19,'Ban Belakang Sport','Ban belakang sport dengan compound lebih lunak di bahu untuk grip saat menikung dalam.','Tipe: Tubeless
Compound: Dual compound
Indeks kecepatan: W (270 km/jam)
Ukuran: 140/70-17 atau 160/60-17',6,8,31,1,DATE_SUB(NOW(), INTERVAL 9 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (34,19,'140/70-17','PIR-DR-14070',1790000,5,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (34,5,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (35,19,'160/60-17','PIR-DR-16060',2050000,4,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (35,4,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (19,'/img/ban.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (19,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (19,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (19,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (19,13);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (20,'Grip Handle Racing','Grip karet empuk dengan tekstur anti-selip, nyaman dipakai lama dan tidak mudah licin saat basah.','Bahan: Karet silikon
Diameter: 22 mm
Panjang: 120 mm
Isi: 1 pasang',7,10,210,1,DATE_SUB(NOW(), INTERVAL 7 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (36,20,'Hitam','DAY-GRIP-BK',85000,50,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (36,50,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (37,20,'Merah','DAY-GRIP-RD',85000,35,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (37,35,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (20,'/img/aksesori.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,7);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (20,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (21,'Spion Bar-End Aluminium','Spion model bar-end dari aluminium CNC. Tampilan lebih ramping dan bidang pandang tetap lebar.','Bahan: Aluminium CNC
Kaca: Cembung anti silau
Pemasangan: Ujung stang
Isi: 1 pasang',7,9,58,1,DATE_SUB(NOW(), INTERVAL 6 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (38,21,'Hitam','KSO-SPN-BK',225000,18,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (38,18,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (21,'/img/aksesori.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (21,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (21,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (21,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (21,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (21,10);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (21,11);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (21,12);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (22,'Speedometer Digital','Speedometer digital dengan layar kontras tinggi, menampilkan kecepatan, rpm, suhu mesin, dan jarak tempuh.','Layar: LCD kontras tinggi
Fungsi: Speed, RPM, suhu, odometer
Tahan air: IP65
Pemasangan: Plug and play',7,9,27,1,DATE_SUB(NOW(), INTERVAL 4 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (39,22,'Universal','KSO-SPD-UNI',1250000,6,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (39,6,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (22,'/img/aksesori.svg',1,0);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,1);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,2);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,3);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,4);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,5);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,6);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,7);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,8);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,9);
INSERT INTO product_motor_compatibilities (product_id,motor_model_id) VALUES (22,10);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (23,'Helm Fullface Racing','Helm fullface dengan cangkang ringan dan visor anti-gores. Ventilasi depan dan belakang menjaga kepala tetap sejuk.','Cangkang: Komposit
Standar: SNI
Visor: Anti-gores, anti-fog ready
Bobot: 1.350 gram',8,11,95,1,DATE_SUB(NOW(), INTERVAL 3 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (40,23,'M','KYT-HLM-M',1850000,10,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (40,10,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (41,23,'L','KYT-HLM-L',1850000,8,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (41,8,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (42,23,'XL','KYT-HLM-XL',1850000,5,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (42,5,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (23,'/img/perlengkapan.svg',1,0);
INSERT INTO products (id,name,description,specs,category_id,brand_id,sold_count,is_active,created_at) VALUES (24,'Sarung Tangan Racing','Sarung tangan kulit dengan pelindung buku jari dan telapak berlapis. Ujung jari kompatibel layar sentuh.','Bahan: Kulit kambing + tekstil
Pelindung: Buku jari karbon
Layar sentuh: Ya
Ukuran: M atau L',8,12,67,1,DATE_SUB(NOW(), INTERVAL 2 DAY));
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (43,24,'M','ALP-GLV-M',899000,12,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (43,12,'initial');
INSERT INTO product_variants (id,product_id,name,sku,price,stock,is_active) VALUES (44,24,'L','ALP-GLV-L',899000,10,1);
INSERT INTO inventory_movements (variant_id,delta,reason) VALUES (44,10,'initial');
INSERT INTO product_images (product_id,path,is_primary,sort_order) VALUES (24,'/img/perlengkapan.svg',1,0);

-- Layanan pengiriman (tarif lokal, bukan tarif live kurir)
INSERT INTO shipping_services (id,code,name,description,eta_text) VALUES (1,'REG','Reguler','Pengiriman standar','3-5 hari kerja'),(2,'ECO','Ekonomi','Paling hemat','5-8 hari kerja'),(3,'EXP','Ekspres','Paling cepat','1-2 hari kerja');
INSERT INTO shipping_rates (service_id,base_cost,per_item_cost) VALUES (1,18000,4000),(2,12000,2500),(3,35000,8000);
INSERT INTO orders (id,order_no,user_id,recipient,phone,address_text,shipping_service_id,shipping_name,subtotal,shipping_cost,total,status,created_at,paid_at) VALUES (1,'RP-DEMO-000001',2,'Dimas Pratama','081200000002','Jl. Melati No. 14, RT 03/RW 05, Bandung, Jawa Barat 40115',1,'Reguler',495000,30000,525000,'Selesai',DATE_SUB(NOW(), INTERVAL 21 DAY),DATE_SUB(NOW(), INTERVAL 21 DAY));
INSERT INTO order_items (order_id,product_id,variant_id,product_name,variant_name,image_path,unit_price,quantity) VALUES (1,1,1,'Kampas Rem Racing Depan','CBR150R / CB150R','/img/pengereman.svg',285000,1);
INSERT INTO order_items (order_id,product_id,variant_id,product_name,variant_name,image_path,unit_price,quantity) VALUES (1,5,9,'Busi Iridium','CR9EIX','/img/kelistrikan.svg',105000,2);
INSERT INTO payments (order_id,method,bank,reference,amount,status,expires_at,paid_at) VALUES (1,'VA','BCA','8808000000000001',525000,'Berhasil',DATE_ADD(DATE_SUB(NOW(), INTERVAL 21 DAY), INTERVAL 15 MINUTE),DATE_SUB(NOW(), INTERVAL 21 DAY));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (1,'Menunggu Pembayaran','Pesanan dibuat, menunggu pembayaran simulasi',2,DATE_SUB(NOW(), INTERVAL 30240 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (1,'Dibayar','Pembayaran simulasi berhasil (bukan transaksi uang sungguhan)',2,DATE_SUB(NOW(), INTERVAL 30060 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (1,'Diproses','Pesanan sedang disiapkan penjual',1,DATE_SUB(NOW(), INTERVAL 29880 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (1,'Diserahkan ke Kurir','Diserahkan ke kurir (JNE, resi JNE0099887701)',1,DATE_SUB(NOW(), INTERVAL 29700 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (1,'Dalam Pengiriman','Paket dalam perjalanan (JNE, resi JNE0099887701)',1,DATE_SUB(NOW(), INTERVAL 29520 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (1,'Diterima','Pesanan dikonfirmasi diterima oleh pelanggan',2,DATE_SUB(NOW(), INTERVAL 29340 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (1,'Selesai','Pesanan selesai',1,DATE_SUB(NOW(), INTERVAL 29160 MINUTE));
INSERT INTO shipments (order_id,courier,tracking_no) VALUES (1,'JNE','JNE0099887701');
INSERT INTO orders (id,order_no,user_id,recipient,phone,address_text,shipping_service_id,shipping_name,subtotal,shipping_cost,total,status,created_at,paid_at) VALUES (2,'RP-DEMO-000002',3,'Rizky Ananda','081200000003','Jl. Kenanga Raya No. 8, Semarang, Jawa Tengah 50241',3,'Ekspres',960000,51000,1011000,'Selesai',DATE_SUB(NOW(), INTERVAL 14 DAY),DATE_SUB(NOW(), INTERVAL 14 DAY));
INSERT INTO order_items (order_id,product_id,variant_id,product_name,variant_name,image_path,unit_price,quantity) VALUES (2,8,14,'Piston Kit Racing','62 mm','/img/mesin.svg',785000,1);
INSERT INTO order_items (order_id,product_id,variant_id,product_name,variant_name,image_path,unit_price,quantity) VALUES (2,10,18,'Filter Udara Racing','Honda','/img/mesin.svg',175000,1);
INSERT INTO payments (order_id,method,bank,reference,amount,status,expires_at,paid_at) VALUES (2,'QRIS',NULL,'QRIS-SIM-000002abc',1011000,'Berhasil',DATE_ADD(DATE_SUB(NOW(), INTERVAL 14 DAY), INTERVAL 15 MINUTE),DATE_SUB(NOW(), INTERVAL 14 DAY));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (2,'Menunggu Pembayaran','Pesanan dibuat, menunggu pembayaran simulasi',3,DATE_SUB(NOW(), INTERVAL 20160 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (2,'Dibayar','Pembayaran simulasi berhasil (bukan transaksi uang sungguhan)',3,DATE_SUB(NOW(), INTERVAL 19980 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (2,'Diproses','Pesanan sedang disiapkan penjual',1,DATE_SUB(NOW(), INTERVAL 19800 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (2,'Diserahkan ke Kurir','Diserahkan ke kurir (J&T Express, resi JT5521098834)',1,DATE_SUB(NOW(), INTERVAL 19620 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (2,'Dalam Pengiriman','Paket dalam perjalanan (J&T Express, resi JT5521098834)',1,DATE_SUB(NOW(), INTERVAL 19440 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (2,'Diterima','Pesanan dikonfirmasi diterima oleh pelanggan',3,DATE_SUB(NOW(), INTERVAL 19260 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (2,'Selesai','Pesanan selesai',1,DATE_SUB(NOW(), INTERVAL 19080 MINUTE));
INSERT INTO shipments (order_id,courier,tracking_no) VALUES (2,'J&T Express','JT5521098834');
INSERT INTO orders (id,order_no,user_id,recipient,phone,address_text,shipping_service_id,shipping_name,subtotal,shipping_cost,total,status,created_at,paid_at) VALUES (3,'RP-DEMO-000003',2,'Dimas Pratama','081200000002','Jl. Melati No. 14, RT 03/RW 05, Bandung, Jawa Barat 40115',1,'Reguler',4850000,22000,4872000,'Dalam Pengiriman',DATE_SUB(NOW(), INTERVAL 3 DAY),DATE_SUB(NOW(), INTERVAL 3 DAY));
INSERT INTO order_items (order_id,product_id,variant_id,product_name,variant_name,image_path,unit_price,quantity) VALUES (3,9,16,'Knalpot Slip-On Titanium','R-77 Titanium','/img/mesin.svg',4850000,1);
INSERT INTO payments (order_id,method,bank,reference,amount,status,expires_at,paid_at) VALUES (3,'VA','Mandiri','8808000000000003',4872000,'Berhasil',DATE_ADD(DATE_SUB(NOW(), INTERVAL 3 DAY), INTERVAL 15 MINUTE),DATE_SUB(NOW(), INTERVAL 3 DAY));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (3,'Menunggu Pembayaran','Pesanan dibuat, menunggu pembayaran simulasi',2,DATE_SUB(NOW(), INTERVAL 4320 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (3,'Dibayar','Pembayaran simulasi berhasil (bukan transaksi uang sungguhan)',2,DATE_SUB(NOW(), INTERVAL 4140 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (3,'Diproses','Pesanan sedang disiapkan penjual',1,DATE_SUB(NOW(), INTERVAL 3960 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (3,'Diserahkan ke Kurir','Diserahkan ke kurir (SiCepat, resi 004512390021)',1,DATE_SUB(NOW(), INTERVAL 3780 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (3,'Dalam Pengiriman','Paket dalam perjalanan (SiCepat, resi 004512390021)',1,DATE_SUB(NOW(), INTERVAL 3600 MINUTE));
INSERT INTO shipments (order_id,courier,tracking_no) VALUES (3,'SiCepat','004512390021');
INSERT INTO orders (id,order_no,user_id,recipient,phone,address_text,shipping_service_id,shipping_name,subtotal,shipping_cost,total,status,created_at,paid_at) VALUES (4,'RP-DEMO-000004',3,'Rizky Ananda','081200000003','Jl. Kenanga Raya No. 8, Semarang, Jawa Tengah 50241',1,'Reguler',2749000,26000,2775000,'Dibayar',DATE_SUB(NOW(), INTERVAL 0 DAY),DATE_SUB(NOW(), INTERVAL 0 DAY));
INSERT INTO order_items (order_id,product_id,variant_id,product_name,variant_name,image_path,unit_price,quantity) VALUES (4,23,41,'Helm Fullface Racing','L','/img/perlengkapan.svg',1850000,1);
INSERT INTO order_items (order_id,product_id,variant_id,product_name,variant_name,image_path,unit_price,quantity) VALUES (4,24,43,'Sarung Tangan Racing','M','/img/perlengkapan.svg',899000,1);
INSERT INTO payments (order_id,method,bank,reference,amount,status,expires_at,paid_at) VALUES (4,'QRIS',NULL,'QRIS-SIM-000004abc',2775000,'Berhasil',DATE_ADD(DATE_SUB(NOW(), INTERVAL 0 DAY), INTERVAL 15 MINUTE),DATE_SUB(NOW(), INTERVAL 0 DAY));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (4,'Menunggu Pembayaran','Pesanan dibuat, menunggu pembayaran simulasi',3,DATE_SUB(NOW(), INTERVAL 0 MINUTE));
INSERT INTO shipment_events (order_id,status,note,actor_id,created_at) VALUES (4,'Dibayar','Pembayaran simulasi berhasil (bukan transaksi uang sungguhan)',3,DATE_SUB(NOW(), INTERVAL 0 MINUTE));

-- Ulasan (hanya untuk pesanan yang sudah diterima/selesai)
INSERT INTO reviews (product_id,order_id,user_id,rating,comment,created_at) VALUES (1,1,2,5,'Gigitan awal tegas dan tidak fading setelah turun gunung. Pemasangan pas tanpa modifikasi.',DATE_SUB(NOW(), INTERVAL 10 DAY));
INSERT INTO reviews (product_id,order_id,user_id,rating,comment,created_at) VALUES (5,1,2,4,'Mesin lebih halus di putaran bawah. Pengiriman rapi dan busi sesuai tipe.',DATE_SUB(NOW(), INTERVAL 10 DAY));
INSERT INTO reviews (product_id,order_id,user_id,rating,comment,created_at) VALUES (8,2,3,5,'Kompresi naik terasa, tarikan atas lebih enteng. Kualitas pengerjaan rapi.',DATE_SUB(NOW(), INTERVAL 5 DAY));
INSERT INTO reviews (product_id,order_id,user_id,rating,comment,created_at) VALUES (10,2,3,4,'Mudah dipasang dan bisa dicuci. Suara hisap udara sedikit lebih terdengar.',DATE_SUB(NOW(), INTERVAL 5 DAY));

-- Chat demo
INSERT INTO conversations (id,customer_id,order_id,subject,last_message_at) VALUES (1,2,3,'Pesanan RP-DEMO-000003',DATE_SUB(NOW(), INTERVAL 2 DAY));
INSERT INTO messages (conversation_id,sender_id,body,created_at) VALUES (1,2,'Halo, apakah knalpotnya sudah dilengkapi DB killer?',DATE_SUB(NOW(), INTERVAL 49 HOUR)),(1,1,'Halo Dimas, sudah termasuk DB killer dan baut pengikat. Paket sudah di kurir ya.',DATE_SUB(NOW(), INTERVAL 48 HOUR));
