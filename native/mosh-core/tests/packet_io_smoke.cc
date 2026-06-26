#include "hovvi_packet_io.h"

#include <cstdint>
#include <iostream>
#include <vector>

int main()
{
  hovvi::mosh::InProcessPacketChannel channel;

  const hovvi::mosh::PacketBytes first = { 0x01, 0x02, 0x03 };
  const hovvi::mosh::PacketBytes second = { 0x04, 0x05 };
  const hovvi::mosh::PacketBytes reply = { 0x09, 0x08, 0x07, 0x06 };

  if ( !channel.client().send( first ) || !channel.client().send( second ) || !channel.server().send( reply ) ) {
    std::cerr << "send failed\n";
    return 1;
  }

  if ( channel.server().pending() != 2 || channel.client().pending() != 1 ) {
    std::cerr << "pending counts mismatch\n";
    return 1;
  }

  hovvi::mosh::PacketBytes received;
  if ( !channel.server().receive( received ) || received != first ) {
    std::cerr << "first packet mismatch\n";
    return 1;
  }
  if ( !channel.server().receive( received ) || received != second ) {
    std::cerr << "second packet mismatch\n";
    return 1;
  }
  if ( channel.server().receive( received ) ) {
    std::cerr << "unexpected server packet\n";
    return 1;
  }
  if ( !channel.client().receive( received ) || received != reply ) {
    std::cerr << "reply packet mismatch\n";
    return 1;
  }

  std::cout << "hovvi packet IO smoke passed\n";
  return 0;
}
