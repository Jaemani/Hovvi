#include "hovvi_mosh_core.h"

#include <stdio.h>
#include <string.h>

static int require(int condition, const char* message)
{
  if (!condition) {
    fprintf(stderr, "FAIL: %s\n", message);
    return 1;
  }
  return 0;
}

int main(void)
{
  int failures = 0;
  hovvi_mosh_core_t* core = NULL;
  hovvi_mosh_terminal_size_t size = {80, 24};
  const char* key = "MDEyMzQ1Njc4OWFiY2RlZg";

  failures += require(strcmp(hovvi_mosh_status_name(HOVVI_MOSH_OK), "ok") == 0, "status name for ok");
  failures += require(strcmp(hovvi_mosh_status_name(HOVVI_MOSH_UNAVAILABLE), "unavailable") == 0,
                      "status name for unavailable");
  failures += require(strcmp(hovvi_mosh_status_name((hovvi_mosh_status_t)999), "unknown") == 0,
                      "status name for unknown");

  failures += require(hovvi_mosh_core_create("short", size, &core) == HOVVI_MOSH_INVALID_ARGUMENT,
                      "short key should be invalid");
  failures += require(core == NULL, "invalid create should not produce core");

  failures += require(hovvi_mosh_core_create(key, (hovvi_mosh_terminal_size_t){0, 24}, &core)
                          == HOVVI_MOSH_INVALID_ARGUMENT,
                      "zero columns should be invalid");
  failures += require(core == NULL, "invalid size should not produce core");

  failures += require(hovvi_mosh_core_create(key, size, NULL) == HOVVI_MOSH_INVALID_ARGUMENT,
                      "null out pointer should be invalid");

  failures += require(hovvi_mosh_core_create(key, size, &core) == HOVVI_MOSH_UNAVAILABLE,
                      "unlinked scaffold should report unavailable");
  failures += require(core == NULL, "unavailable create should not produce core");

  hovvi_mosh_frame_t frame = {
      .terminal_output = {.data = NULL, .len = 0},
      .outbound_packets = NULL,
      .outbound_packet_count = 0,
  };
  failures += require(hovvi_mosh_core_shutdown(NULL, &frame) == HOVVI_MOSH_INVALID_ARGUMENT,
                      "shutdown without core should be invalid");
  hovvi_mosh_frame_free(&frame);
  failures += require(frame.terminal_output.data == NULL, "frame free clears output");
  failures += require(frame.outbound_packets == NULL, "frame free clears packets");

  if (failures == 0) {
    puts("hovvi mosh core ABI smoke passed");
  }
  return failures == 0 ? 0 : 1;
}
