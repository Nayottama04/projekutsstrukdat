cmake_minimum_required(VERSION 3.16)
project(RaceParts CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_executable(raceparts src/main.cpp)

# Crow (header tunggal) + Asio standalone sudah disertakan di third_party/
target_include_directories(raceparts PRIVATE src third_party third_party/asio/include)
target_compile_definitions(raceparts PRIVATE ASIO_STANDALONE)

find_package(Threads REQUIRED)
target_link_libraries(raceparts PRIVATE Threads::Threads)

# MySQL Connector/C++ (API legacy "JDBC": mysql_driver.h)
# Linux/WSL : sudo apt install libmysqlcppconn-dev  (ditemukan otomatis)
# Windows   : isi -DMYSQLCPPCONN_ROOT="C:\mysql-connector-c++-8.0.32-winx64"
set(MYSQLCPPCONN_ROOT "" CACHE PATH "Folder instalasi MySQL Connector/C++ (Windows)")
if(MYSQLCPPCONN_ROOT)
  target_include_directories(raceparts PRIVATE "${MYSQLCPPCONN_ROOT}/include/jdbc" "${MYSQLCPPCONN_ROOT}/include")
  find_library(MYSQLCPPCONN_LIB NAMES mysqlcppconn mysqlcppconn-static
               PATHS "${MYSQLCPPCONN_ROOT}/lib64/vs14" "${MYSQLCPPCONN_ROOT}/lib64" "${MYSQLCPPCONN_ROOT}/lib"
               NO_DEFAULT_PATH)
else()
  find_library(MYSQLCPPCONN_LIB NAMES mysqlcppconn)
endif()
if(NOT MYSQLCPPCONN_LIB)
  message(FATAL_ERROR "MySQL Connector/C++ tidak ditemukan. Lihat README.md bagian 'Persiapan'.")
endif()
target_link_libraries(raceparts PRIVATE ${MYSQLCPPCONN_LIB})

if(WIN32)
  target_compile_definitions(raceparts PRIVATE _WIN32_WINNT=0x0A00 WIN32_LEAN_AND_MEAN NOMINMAX _CRT_SECURE_NO_WARNINGS)
  target_link_libraries(raceparts PRIVATE ws2_32 mswsock)
endif()
if(MSVC)
  target_compile_options(raceparts PRIVATE /utf-8 /bigobj)
endif()
