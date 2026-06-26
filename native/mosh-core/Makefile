CC ?= cc
CXX ?= c++
AR ?= ar
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -pedantic -O2
CPPFLAGS ?= -Iinclude
UPSTREAM_CXXFLAGS ?= -std=c++17 -Wall -Wextra -Wno-deprecated-declarations -Wno-unused-parameter -O2
BUILD_DIR ?= build

LIB := $(BUILD_DIR)/libhovvi_mosh_core.a
SMOKE := $(BUILD_DIR)/abi_smoke
SRC := src/hovvi_mosh_core_unavailable.c
OBJ := $(BUILD_DIR)/hovvi_mosh_core_unavailable.o
UPSTREAM_VENDOR_DIR := vendor/mosh
UPSTREAM_BUILD_DIR := $(BUILD_DIR)/upstream
UPSTREAM_CONFIG_SRC := config/apple-common-crypto-config.h
UPSTREAM_CONFIG_ROOT := $(UPSTREAM_BUILD_DIR)/include/config.h
UPSTREAM_CONFIG_NESTED := $(UPSTREAM_BUILD_DIR)/include/src/include/config.h
UPSTREAM_CPPFLAGS := -I$(UPSTREAM_BUILD_DIR)/include -I$(UPSTREAM_VENDOR_DIR)
UPSTREAM_CRYPTO_SRC := \
	$(UPSTREAM_VENDOR_DIR)/src/crypto/base64.cc \
	$(UPSTREAM_VENDOR_DIR)/src/crypto/crypto.cc \
	$(UPSTREAM_VENDOR_DIR)/src/crypto/ocb_internal.cc
UPSTREAM_CRYPTO_OBJ := $(patsubst $(UPSTREAM_VENDOR_DIR)/%.cc,$(UPSTREAM_BUILD_DIR)/vendor/%.o,$(UPSTREAM_CRYPTO_SRC))
UPSTREAM_SMOKE := $(UPSTREAM_BUILD_DIR)/upstream_crypto_smoke

.PHONY: all check upstream-check clean

all: $(LIB)

check: $(SMOKE)
	$(SMOKE)

upstream-check: $(UPSTREAM_SMOKE)
	$(UPSTREAM_SMOKE)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(OBJ): $(SRC) include/hovvi_mosh_core.h | $(BUILD_DIR)
	$(CC) $(CPPFLAGS) $(CFLAGS) -c $(SRC) -o $(OBJ)

$(LIB): $(OBJ)
	$(AR) rcs $(LIB) $(OBJ)

$(SMOKE): tests/abi_smoke.c $(LIB)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/abi_smoke.c $(LIB) -o $(SMOKE)

$(UPSTREAM_CONFIG_ROOT): $(UPSTREAM_CONFIG_SRC) | $(BUILD_DIR)
	mkdir -p $(dir $@)
	cp $(UPSTREAM_CONFIG_SRC) $@

$(UPSTREAM_CONFIG_NESTED): $(UPSTREAM_CONFIG_SRC) | $(BUILD_DIR)
	mkdir -p $(dir $@)
	cp $(UPSTREAM_CONFIG_SRC) $@

$(UPSTREAM_BUILD_DIR)/vendor/%.o: $(UPSTREAM_VENDOR_DIR)/%.cc $(UPSTREAM_CONFIG_ROOT) $(UPSTREAM_CONFIG_NESTED)
	mkdir -p $(dir $@)
	$(CXX) $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) -c $< -o $@

$(UPSTREAM_SMOKE): tests/upstream_crypto_smoke.cc $(UPSTREAM_CRYPTO_OBJ)
	$(CXX) $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) tests/upstream_crypto_smoke.cc $(UPSTREAM_CRYPTO_OBJ) -o $(UPSTREAM_SMOKE)

clean:
	rm -rf $(BUILD_DIR)
