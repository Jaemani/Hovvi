#include "hovvi_mosh_core.h"

#include <stdlib.h>
#include <string.h>

struct hovvi_mosh_core {
  char printable_key[23];
  hovvi_mosh_terminal_size_t initial_size;
};

static int is_valid_printable_key(const char* value);
static void clear_frame(hovvi_mosh_frame_t* frame);

const char* hovvi_mosh_status_name(hovvi_mosh_status_t status)
{
  switch (status) {
    case HOVVI_MOSH_OK:
      return "ok";
    case HOVVI_MOSH_INVALID_ARGUMENT:
      return "invalid_argument";
    case HOVVI_MOSH_CRYPTO_ERROR:
      return "crypto_error";
    case HOVVI_MOSH_PROTOCOL_ERROR:
      return "protocol_error";
    case HOVVI_MOSH_INTERNAL_ERROR:
      return "internal_error";
    case HOVVI_MOSH_UNAVAILABLE:
      return "unavailable";
    default:
      return "unknown";
  }
}

hovvi_mosh_status_t hovvi_mosh_core_create(const char* printable_key,
                                           hovvi_mosh_terminal_size_t initial_size,
                                           hovvi_mosh_core_t** out_core)
{
  if (!out_core) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  *out_core = NULL;

  if (!is_valid_printable_key(printable_key) || initial_size.columns == 0 || initial_size.rows == 0) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }

  return HOVVI_MOSH_UNAVAILABLE;
}

hovvi_mosh_status_t hovvi_mosh_core_receive_packet(hovvi_mosh_core_t* core,
                                                   hovvi_mosh_bytes_t packet,
                                                   hovvi_mosh_frame_t* out_frame)
{
  if (!core || !out_frame || (packet.len > 0 && !packet.data)) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame(out_frame);
  return HOVVI_MOSH_UNAVAILABLE;
}

hovvi_mosh_status_t hovvi_mosh_core_send_user_input(hovvi_mosh_core_t* core,
                                                    hovvi_mosh_bytes_t input,
                                                    hovvi_mosh_frame_t* out_frame)
{
  if (!core || !out_frame || (input.len > 0 && !input.data)) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame(out_frame);
  return HOVVI_MOSH_UNAVAILABLE;
}

hovvi_mosh_status_t hovvi_mosh_core_resize(hovvi_mosh_core_t* core,
                                           hovvi_mosh_terminal_size_t size,
                                           hovvi_mosh_frame_t* out_frame)
{
  if (!core || !out_frame || size.columns == 0 || size.rows == 0) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame(out_frame);
  return HOVVI_MOSH_UNAVAILABLE;
}

hovvi_mosh_status_t hovvi_mosh_core_shutdown(hovvi_mosh_core_t* core, hovvi_mosh_frame_t* out_frame)
{
  if (!core || !out_frame) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame(out_frame);
  return HOVVI_MOSH_UNAVAILABLE;
}

void hovvi_mosh_frame_free(hovvi_mosh_frame_t* frame)
{
  if (!frame) {
    return;
  }
  free((void*)frame->terminal_output.data);
  if (frame->outbound_packets) {
    for (size_t i = 0; i < frame->outbound_packet_count; i++) {
      free((void*)frame->outbound_packets[i].data);
    }
  }
  free(frame->outbound_packets);
  clear_frame(frame);
}

void hovvi_mosh_core_destroy(hovvi_mosh_core_t* core)
{
  free(core);
}

static int is_valid_printable_key(const char* value)
{
  if (!value || strlen(value) != 22) {
    return 0;
  }
  for (size_t i = 0; i < 22; i++) {
    const char ch = value[i];
    const int alpha = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
    const int digit = ch >= '0' && ch <= '9';
    const int symbol = ch == '+' || ch == '/';
    if (!alpha && !digit && !symbol) {
      return 0;
    }
  }
  return 1;
}

static void clear_frame(hovvi_mosh_frame_t* frame)
{
  frame->terminal_output.data = NULL;
  frame->terminal_output.len = 0;
  frame->outbound_packets = NULL;
  frame->outbound_packet_count = 0;
}
