#include "hovvi_packet_io.h"
#include "hovvi_relay_datagram.h"

#include <cstdint>
#include <iostream>
#include <vector>

int main()
{
  using hovvi::mosh::InProcessPacketChannel;
  using hovvi::mosh::PacketBytes;
  using hovvi::mosh::RelayDatagramEndpoint;
  using hovvi::mosh::RelayDatagramStatus;

  InProcessPacketChannel channel;

  const PacketBytes first = { 0x01, 0x02, 0x03 };
  const PacketBytes second = { 0x04, 0x05 };
  const PacketBytes reply = { 0x09, 0x08, 0x07, 0x06 };

  if ( !channel.client().send( first ) || !channel.client().send( second ) || !channel.server().send( reply ) ) {
    std::cerr << "send failed\n";
    return 1;
  }

  if ( channel.server().pending() != 2 || channel.client().pending() != 1 ) {
    std::cerr << "pending counts mismatch\n";
    return 1;
  }

  PacketBytes received;
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

  InProcessPacketChannel relay_channel;
  RelayDatagramEndpoint relay_client( relay_channel.client(), 4 );
  RelayDatagramEndpoint relay_server( relay_channel.server(), 4 );

  if ( relay_client.max_datagram_bytes() != 4 ) {
    std::cerr << "unexpected relay datagram limit\n";
    return 1;
  }
  if ( relay_client.receive( received ) != RelayDatagramStatus::Empty ) {
    std::cerr << "empty relay receive did not report empty\n";
    return 1;
  }
  if ( relay_client.send( { 0x01, 0x02, 0x03, 0x04, 0x05 } ) != RelayDatagramStatus::Oversize ) {
    std::cerr << "oversize relay datagram accepted\n";
    return 1;
  }
  if ( relay_server.pending() != 0 ) {
    std::cerr << "oversize relay datagram was queued\n";
    return 1;
  }
  if ( relay_client.send( { 0x0a, 0x0b, 0x0c, 0x0d } ) != RelayDatagramStatus::Ok ) {
    std::cerr << "bounded relay datagram send failed\n";
    return 1;
  }
  if ( relay_server.receive( received ) != RelayDatagramStatus::Ok
       || received != PacketBytes( { 0x0a, 0x0b, 0x0c, 0x0d } ) ) {
    std::cerr << "bounded relay datagram mismatch\n";
    return 1;
  }

  hovvi::mosh::PacketEndpoint disconnected;
  RelayDatagramEndpoint disconnected_relay( disconnected, 4 );
  if ( disconnected_relay.send( { 0x01 } ) != RelayDatagramStatus::NoPeer ) {
    std::cerr << "disconnected relay send did not report no peer\n";
    return 1;
  }

  std::cout << "hovvi packet IO smoke passed\n";
  return 0;
}
