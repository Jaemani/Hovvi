#ifndef HOVVI_MOSH_CORE_H
#define HOVVI_MOSH_CORE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct hovvi_mosh_core hovvi_mosh_core_t;

typedef struct {
  const uint8_t* data;
  size_t len;
} hovvi_mosh_bytes_t;

typedef struct {
  uint32_t columns;
  uint32_t rows;
} hovvi_mosh_terminal_size_t;

typedef struct {
  hovvi_mosh_bytes_t terminal_output;
  hovvi_mosh_bytes_t* outbound_packets;
  size_t outbound_packet_count;
} hovvi_mosh_frame_t;

typedef enum {
  HOVVI_MOSH_OK = 0,
  HOVVI_MOSH_INVALID_ARGUMENT = 1,
  HOVVI_MOSH_CRYPTO_ERROR = 2,
  HOVVI_MOSH_PROTOCOL_ERROR = 3,
  HOVVI_MOSH_INTERNAL_ERROR = 4,
  HOVVI_MOSH_UNAVAILABLE = 5
} hovvi_mosh_status_t;

const char* hovvi_mosh_status_name(hovvi_mosh_status_t status);

hovvi_mosh_status_t hovvi_mosh_core_create(const char* printable_key,
                                           hovvi_mosh_terminal_size_t initial_size,
                                           hovvi_mosh_core_t** out_core);

hovvi_mosh_status_t hovvi_mosh_core_receive_packet(hovvi_mosh_core_t* core,
                                                   hovvi_mosh_bytes_t packet,
                                                   hovvi_mosh_frame_t* out_frame);

hovvi_mosh_status_t hovvi_mosh_core_send_user_input(hovvi_mosh_core_t* core,
                                                    hovvi_mosh_bytes_t input,
                                                    hovvi_mosh_frame_t* out_frame);

hovvi_mosh_status_t hovvi_mosh_core_resize(hovvi_mosh_core_t* core,
                                           hovvi_mosh_terminal_size_t size,
                                           hovvi_mosh_frame_t* out_frame);

hovvi_mosh_status_t hovvi_mosh_core_shutdown(hovvi_mosh_core_t* core, hovvi_mosh_frame_t* out_frame);

void hovvi_mosh_frame_free(hovvi_mosh_frame_t* frame);
void hovvi_mosh_core_destroy(hovvi_mosh_core_t* core);

#ifdef __cplusplus
}
#endif

#endif
