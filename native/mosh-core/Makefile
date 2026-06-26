CC ?= cc
AR ?= ar
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -pedantic -O2
CPPFLAGS ?= -Iinclude
BUILD_DIR ?= build

LIB := $(BUILD_DIR)/libhovvi_mosh_core.a
SMOKE := $(BUILD_DIR)/abi_smoke
SRC := src/hovvi_mosh_core_unavailable.c
OBJ := $(BUILD_DIR)/hovvi_mosh_core_unavailable.o

.PHONY: all check clean

all: $(LIB)

check: $(SMOKE)
	$(SMOKE)

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(OBJ): $(SRC) include/hovvi_mosh_core.h | $(BUILD_DIR)
	$(CC) $(CPPFLAGS) $(CFLAGS) -c $(SRC) -o $(OBJ)

$(LIB): $(OBJ)
	$(AR) rcs $(LIB) $(OBJ)

$(SMOKE): tests/abi_smoke.c $(LIB)
	$(CC) $(CPPFLAGS) $(CFLAGS) tests/abi_smoke.c $(LIB) -o $(SMOKE)

clean:
	rm -rf $(BUILD_DIR)
