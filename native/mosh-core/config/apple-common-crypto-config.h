#ifndef HOVVI_MOSH_CORE_APPLE_COMMON_CRYPTO_CONFIG_H
#define HOVVI_MOSH_CORE_APPLE_COMMON_CRYPTO_CONFIG_H

/*
 * Hovvi-owned config shim for compiling the vendored upstream mosh crypto
 * sources on Apple platforms without running upstream Autoconf.
 */

#define USE_APPLE_COMMON_CRYPTO_AES 1

#define HAVE_CLOCK_GETTIME 1
#define HAVE_GETTIMEOFDAY 1
#define HAVE_MACH_ABSOLUTE_TIME 1
#define HAVE_POSIX_MEMALIGN 1
#define HAVE_STRINGS_H 1
#define HAVE_CURSES_H 1

#define HAVE_DECL___BUILTIN_BSWAP64 1
#define HAVE_DECL___BUILTIN_CTZ 1
#define HAVE_DECL_BE64TOH 0
#define HAVE_DECL_BETOH64 0
#define HAVE_DECL_BSWAP64 0
#define HAVE_DECL_FFS 1
#define HAVE_OSX_SWAP 1

#endif
