CC ?= cc
CXX ?= c++
AR ?= ar
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -pedantic -O2
CPPFLAGS ?= -Iinclude
ADAPTER_CXXFLAGS ?= -std=c++17 -Wall -Wextra -Werror -pedantic -O2
UPSTREAM_CXXFLAGS ?= -std=c++17 -Wall -Wextra -Wno-deprecated-declarations -Wno-unused-parameter -O2
BUILD_DIR ?= build
PROTOBUF_PREFIX ?= $(shell brew --prefix protobuf 2>/dev/null)
ABSEIL_PREFIX ?= $(shell brew --prefix abseil 2>/dev/null)
PKG_CONFIG ?= pkg-config
PROTOBUF_PKG_CONFIG_PATH := $(PROTOBUF_PREFIX)/lib/pkgconfig:$(ABSEIL_PREFIX)/lib/pkgconfig:$(PKG_CONFIG_PATH)
PROTOBUF_PKG_CFLAGS := $(shell PKG_CONFIG_PATH="$(PROTOBUF_PKG_CONFIG_PATH)" $(PKG_CONFIG) --cflags protobuf-lite 2>/dev/null)
PROTOBUF_PKG_LIBS := $(shell PKG_CONFIG_PATH="$(PROTOBUF_PKG_CONFIG_PATH)" $(PKG_CONFIG) --libs protobuf-lite 2>/dev/null)
PROTOC ?= $(if $(PROTOBUF_PREFIX),$(PROTOBUF_PREFIX)/bin/protoc,protoc)
PROTOBUF_CPPFLAGS ?= $(if $(PROTOBUF_PKG_CFLAGS),$(PROTOBUF_PKG_CFLAGS),$(if $(PROTOBUF_PREFIX),-I$(PROTOBUF_PREFIX)/include,) $(if $(ABSEIL_PREFIX),-I$(ABSEIL_PREFIX)/include,))
PROTOBUF_LDFLAGS ?= $(if $(PROTOBUF_PREFIX),-L$(PROTOBUF_PREFIX)/lib,)
PROTOBUF_LIBS ?= -lprotobuf-lite
PROTOBUF_LDLIBS ?= $(if $(PROTOBUF_PKG_LIBS),$(PROTOBUF_PKG_LIBS),$(PROTOBUF_LDFLAGS) $(PROTOBUF_LIBS))

LIB := $(BUILD_DIR)/libhovvi_mosh_core.a
SMOKE := $(BUILD_DIR)/abi_smoke
ADAPTER_SMOKE := $(BUILD_DIR)/packet_io_smoke
SRC := src/hovvi_mosh_core_unavailable.c
OBJ := $(BUILD_DIR)/hovvi_mosh_core_unavailable.o
UPSTREAM_VENDOR_DIR := vendor/mosh
UPSTREAM_BUILD_DIR := $(BUILD_DIR)/upstream
UPSTREAM_CONFIG_SRC := config/apple-common-crypto-config.h
UPSTREAM_CONFIG_ROOT := $(UPSTREAM_BUILD_DIR)/include/config.h
UPSTREAM_CONFIG_NESTED := $(UPSTREAM_BUILD_DIR)/include/src/include/config.h
UPSTREAM_GENERATED_DIR := $(UPSTREAM_BUILD_DIR)/generated
UPSTREAM_CPPFLAGS := -I$(UPSTREAM_BUILD_DIR)/include -I$(UPSTREAM_GENERATED_DIR) -I$(UPSTREAM_VENDOR_DIR) $(PROTOBUF_CPPFLAGS)
UPSTREAM_CRYPTO_SRC := \
	$(UPSTREAM_VENDOR_DIR)/src/crypto/base64.cc \
	$(UPSTREAM_VENDOR_DIR)/src/crypto/crypto.cc \
	$(UPSTREAM_VENDOR_DIR)/src/crypto/ocb_internal.cc
UPSTREAM_CRYPTO_OBJ := $(patsubst $(UPSTREAM_VENDOR_DIR)/%.cc,$(UPSTREAM_BUILD_DIR)/vendor/%.o,$(UPSTREAM_CRYPTO_SRC))
UPSTREAM_PROTO_SRC := \
	$(UPSTREAM_VENDOR_DIR)/src/protobufs/transportinstruction.proto \
	$(UPSTREAM_VENDOR_DIR)/src/protobufs/userinput.proto \
	$(UPSTREAM_VENDOR_DIR)/src/protobufs/hostinput.proto
UPSTREAM_PROTO_CC := $(patsubst $(UPSTREAM_VENDOR_DIR)/%.proto,$(UPSTREAM_GENERATED_DIR)/%.pb.cc,$(UPSTREAM_PROTO_SRC))
UPSTREAM_PROTO_H := $(UPSTREAM_PROTO_CC:.pb.cc=.pb.h)
UPSTREAM_PROTO_OBJ := $(patsubst $(UPSTREAM_GENERATED_DIR)/%.cc,$(UPSTREAM_BUILD_DIR)/generated/%.o,$(UPSTREAM_PROTO_CC))
UPSTREAM_NETWORK_SRC := \
	$(UPSTREAM_VENDOR_DIR)/src/network/compressor.cc \
	$(UPSTREAM_VENDOR_DIR)/src/network/transportfragment.cc
UPSTREAM_NETWORK_OBJ := $(patsubst $(UPSTREAM_VENDOR_DIR)/%.cc,$(UPSTREAM_BUILD_DIR)/vendor/%.o,$(UPSTREAM_NETWORK_SRC))
UPSTREAM_PACKET_SRC := \
	$(UPSTREAM_VENDOR_DIR)/src/network/network.cc \
	$(UPSTREAM_VENDOR_DIR)/src/util/timestamp.cc
UPSTREAM_PACKET_OBJ := $(patsubst $(UPSTREAM_VENDOR_DIR)/%.cc,$(UPSTREAM_BUILD_DIR)/vendor/%.o,$(UPSTREAM_PACKET_SRC))
UPSTREAM_TERMINAL_SRC := \
	$(UPSTREAM_VENDOR_DIR)/src/statesync/completeterminal.cc \
	$(UPSTREAM_VENDOR_DIR)/src/statesync/user.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/parser.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/parseraction.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/parserstate.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/terminal.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/terminaldispatcher.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/terminaldisplay.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/terminaldisplayinit.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/terminalframebuffer.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/terminalfunctions.cc \
	$(UPSTREAM_VENDOR_DIR)/src/terminal/terminaluserinput.cc
UPSTREAM_TERMINAL_OBJ := $(patsubst $(UPSTREAM_VENDOR_DIR)/%.cc,$(UPSTREAM_BUILD_DIR)/vendor/%.o,$(UPSTREAM_TERMINAL_SRC))
UPSTREAM_CRYPTO_SMOKE := $(UPSTREAM_BUILD_DIR)/upstream_crypto_smoke
UPSTREAM_NETWORK_SMOKE := $(UPSTREAM_BUILD_DIR)/upstream_network_smoke
UPSTREAM_PACKET_SMOKE := $(UPSTREAM_BUILD_DIR)/upstream_packet_smoke
UPSTREAM_RELAY_PACKET_SMOKE := $(UPSTREAM_BUILD_DIR)/upstream_relay_packet_smoke
UPSTREAM_ABI_OBJ := $(UPSTREAM_BUILD_DIR)/hovvi_mosh_core_upstream.o
UPSTREAM_ABI_SMOKE := $(UPSTREAM_BUILD_DIR)/upstream_abi_smoke

.PHONY: all check adapter-check upstream-check clean
.SECONDARY: $(UPSTREAM_PROTO_CC) $(UPSTREAM_PROTO_H)

all: $(LIB)

check: $(SMOKE)
	$(SMOKE)

adapter-check: $(ADAPTER_SMOKE)
	$(ADAPTER_SMOKE)

upstream-check: $(UPSTREAM_CRYPTO_SMOKE) $(UPSTREAM_NETWORK_SMOKE) $(UPSTREAM_PACKET_SMOKE) $(UPSTREAM_RELAY_PACKET_SMOKE) $(UPSTREAM_ABI_SMOKE)
	$(UPSTREAM_CRYPTO_SMOKE)
	$(UPSTREAM_NETWORK_SMOKE)
	$(UPSTREAM_PACKET_SMOKE)
	$(UPSTREAM_RELAY_PACKET_SMOKE)
	$(UPSTREAM_ABI_SMOKE)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(OBJ): $(SRC) include/hovvi_mosh_core.h | $(BUILD_DIR)
	$(CC) $(CPPFLAGS) $(CFLAGS) -c $(SRC) -o $(OBJ)

$(LIB): $(OBJ)
	$(AR) rcs $(LIB) $(OBJ)

$(SMOKE): tests/abi_smoke.c $(LIB)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/abi_smoke.c $(LIB) -o $(SMOKE)

$(ADAPTER_SMOKE): tests/packet_io_smoke.cc adapter/hovvi_packet_io.h adapter/hovvi_relay_datagram.h | $(BUILD_DIR)
	$(CXX) -Iadapter $(ADAPTER_CXXFLAGS) tests/packet_io_smoke.cc -o $(ADAPTER_SMOKE)

$(UPSTREAM_CONFIG_ROOT): $(UPSTREAM_CONFIG_SRC) | $(BUILD_DIR)
	mkdir -p $(dir $@)
	cp $(UPSTREAM_CONFIG_SRC) $@

$(UPSTREAM_CONFIG_NESTED): $(UPSTREAM_CONFIG_SRC) | $(BUILD_DIR)
	mkdir -p $(dir $@)
	cp $(UPSTREAM_CONFIG_SRC) $@

$(UPSTREAM_BUILD_DIR)/vendor/%.o: $(UPSTREAM_VENDOR_DIR)/%.cc $(UPSTREAM_CONFIG_ROOT) $(UPSTREAM_CONFIG_NESTED)
	mkdir -p $(dir $@)
	$(CXX) $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) -c $< -o $@

$(UPSTREAM_NETWORK_OBJ) $(UPSTREAM_TERMINAL_OBJ): $(UPSTREAM_PROTO_H)

$(UPSTREAM_GENERATED_DIR)/%.pb.cc $(UPSTREAM_GENERATED_DIR)/%.pb.h: $(UPSTREAM_VENDOR_DIR)/%.proto
	mkdir -p $(UPSTREAM_GENERATED_DIR)
	$(PROTOC) --cpp_out=$(UPSTREAM_GENERATED_DIR) -I$(UPSTREAM_VENDOR_DIR) $<

$(UPSTREAM_BUILD_DIR)/generated/%.o: $(UPSTREAM_GENERATED_DIR)/%.cc
	mkdir -p $(dir $@)
	$(CXX) $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) -c $< -o $@

$(UPSTREAM_CRYPTO_SMOKE): tests/upstream_crypto_smoke.cc $(UPSTREAM_CRYPTO_OBJ)
	$(CXX) $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) tests/upstream_crypto_smoke.cc $(UPSTREAM_CRYPTO_OBJ) -o $(UPSTREAM_CRYPTO_SMOKE)

$(UPSTREAM_NETWORK_SMOKE): tests/upstream_network_smoke.cc $(UPSTREAM_PROTO_OBJ) $(UPSTREAM_NETWORK_OBJ)
	$(CXX) $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) tests/upstream_network_smoke.cc $(UPSTREAM_PROTO_OBJ) $(UPSTREAM_NETWORK_OBJ) $(PROTOBUF_LDLIBS) -lz -o $(UPSTREAM_NETWORK_SMOKE)

$(UPSTREAM_PACKET_SMOKE): tests/upstream_packet_smoke.cc $(UPSTREAM_PACKET_OBJ) $(UPSTREAM_CRYPTO_OBJ)
	$(CXX) $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) tests/upstream_packet_smoke.cc $(UPSTREAM_PACKET_OBJ) $(UPSTREAM_CRYPTO_OBJ) -o $(UPSTREAM_PACKET_SMOKE)

$(UPSTREAM_RELAY_PACKET_SMOKE): tests/upstream_relay_packet_smoke.cc adapter/hovvi_packet_io.h adapter/hovvi_relay_datagram.h $(UPSTREAM_PACKET_OBJ) $(UPSTREAM_CRYPTO_OBJ)
	$(CXX) -Iadapter $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) tests/upstream_relay_packet_smoke.cc $(UPSTREAM_PACKET_OBJ) $(UPSTREAM_CRYPTO_OBJ) -o $(UPSTREAM_RELAY_PACKET_SMOKE)

$(UPSTREAM_ABI_OBJ): src/hovvi_mosh_core_upstream.cc include/hovvi_mosh_core.h $(UPSTREAM_PROTO_H) $(UPSTREAM_CONFIG_ROOT) $(UPSTREAM_CONFIG_NESTED)
	mkdir -p $(dir $@)
	$(CXX) -Iinclude $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) -c src/hovvi_mosh_core_upstream.cc -o $(UPSTREAM_ABI_OBJ)

$(UPSTREAM_ABI_SMOKE): tests/upstream_abi_smoke.cc include/hovvi_mosh_core.h $(UPSTREAM_ABI_OBJ) $(UPSTREAM_PACKET_OBJ) $(UPSTREAM_CRYPTO_OBJ) $(UPSTREAM_PROTO_OBJ) $(UPSTREAM_TERMINAL_OBJ)
	$(CXX) -Iinclude $(UPSTREAM_CPPFLAGS) $(UPSTREAM_CXXFLAGS) tests/upstream_abi_smoke.cc $(UPSTREAM_ABI_OBJ) $(UPSTREAM_PACKET_OBJ) $(UPSTREAM_CRYPTO_OBJ) $(UPSTREAM_PROTO_OBJ) $(UPSTREAM_TERMINAL_OBJ) $(PROTOBUF_LDLIBS) -lz -lcurses -o $(UPSTREAM_ABI_SMOKE)

clean:
	rm -rf $(BUILD_DIR)
