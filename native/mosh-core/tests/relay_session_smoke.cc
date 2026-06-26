#include "hovvi_mosh_relay_session.h"

#include <cstdint>
#include <iostream>
#include <vector>

class FakeCore final : public hovvi::mosh::MoshCoreDriver
{
public:
  std::vector<hovvi::mosh::PacketBytes> received_packets;

  hovvi::mosh::MoshCoreStatus receive_packet( const hovvi::mosh::PacketBytes& packet,
                                              hovvi::mosh::MoshCoreFrame& frame ) override
  {
    received_packets.push_back( packet );
    frame.terminal_output = packet;
    frame.next_tick_ms = 25;
    return hovvi::mosh::MoshCoreStatus::Ok;
  }

  hovvi::mosh::MoshCoreStatus send_user_input( const hovvi::mosh::PacketBytes& input,
                                               hovvi::mosh::MoshCoreFrame& frame ) override
  {
    frame.outbound_packets = { input, hovvi::mosh::PacketBytes { 0x09 } };
    frame.next_tick_ms = 50;
    return hovvi::mosh::MoshCoreStatus::Ok;
  }

  hovvi::mosh::MoshCoreStatus resize( uint32_t columns, uint32_t rows, hovvi::mosh::MoshCoreFrame& frame ) override
  {
    frame.outbound_packets = { hovvi::mosh::PacketBytes { static_cast<uint8_t>( columns ), static_cast<uint8_t>( rows ) } };
    return hovvi::mosh::MoshCoreStatus::Ok;
  }

  hovvi::mosh::MoshCoreStatus tick( uint64_t now_ms, hovvi::mosh::MoshCoreFrame& frame ) override
  {
    frame.outbound_packets = { hovvi::mosh::PacketBytes { static_cast<uint8_t>( now_ms & 0xff ) } };
    return hovvi::mosh::MoshCoreStatus::Ok;
  }

  hovvi::mosh::MoshCoreStatus shutdown( hovvi::mosh::MoshCoreFrame& frame ) override
  {
    frame.clean_shutdown = true;
    return hovvi::mosh::MoshCoreStatus::Ok;
  }
};

class FailingCore final : public hovvi::mosh::MoshCoreDriver
{
public:
  hovvi::mosh::MoshCoreStatus receive_packet( const hovvi::mosh::PacketBytes&, hovvi::mosh::MoshCoreFrame& ) override
  {
    return hovvi::mosh::MoshCoreStatus::ProtocolError;
  }
  hovvi::mosh::MoshCoreStatus send_user_input( const hovvi::mosh::PacketBytes&, hovvi::mosh::MoshCoreFrame& ) override
  {
    return hovvi::mosh::MoshCoreStatus::ProtocolError;
  }
  hovvi::mosh::MoshCoreStatus resize( uint32_t, uint32_t, hovvi::mosh::MoshCoreFrame& ) override
  {
    return hovvi::mosh::MoshCoreStatus::ProtocolError;
  }
  hovvi::mosh::MoshCoreStatus tick( uint64_t, hovvi::mosh::MoshCoreFrame& ) override
  {
    return hovvi::mosh::MoshCoreStatus::ProtocolError;
  }
  hovvi::mosh::MoshCoreStatus shutdown( hovvi::mosh::MoshCoreFrame& ) override
  {
    return hovvi::mosh::MoshCoreStatus::ProtocolError;
  }
};

int main()
{
  using hovvi::mosh::InProcessPacketChannel;
  using hovvi::mosh::MoshCoreFrame;
  using hovvi::mosh::MoshRelaySession;
  using hovvi::mosh::MoshRelaySessionStatus;
  using hovvi::mosh::PacketBytes;
  using hovvi::mosh::RelayDatagramEndpoint;

  InProcessPacketChannel channel;
  RelayDatagramEndpoint client_relay( channel.client(), 8 );
  RelayDatagramEndpoint server_relay( channel.server(), 8 );
  FakeCore core;
  MoshRelaySession session( core, client_relay );
  MoshCoreFrame frame;

  if ( session.pump_inbound( frame ) != MoshRelaySessionStatus::Empty ) {
    std::cerr << "empty inbound pump did not report empty\n";
    return 1;
  }

  if ( server_relay.send( { 0x01, 0x02, 0x03 } ) != hovvi::mosh::RelayDatagramStatus::Ok ) {
    std::cerr << "server setup send failed\n";
    return 1;
  }
  if ( session.pump_inbound( frame ) != MoshRelaySessionStatus::Ok || frame.terminal_output != PacketBytes( { 0x01, 0x02, 0x03 } )
       || frame.next_tick_ms != 25 || core.received_packets.size() != 1 ) {
    std::cerr << "inbound pump mismatch\n";
    return 1;
  }

  frame = MoshCoreFrame {};
  if ( session.send_user_input( { 0x04, 0x05 }, frame ) != MoshRelaySessionStatus::Ok ) {
    std::cerr << "input send failed\n";
    return 1;
  }
  PacketBytes first;
  PacketBytes second;
  if ( server_relay.receive( first ) != hovvi::mosh::RelayDatagramStatus::Ok || first != PacketBytes( { 0x04, 0x05 } )
       || server_relay.receive( second ) != hovvi::mosh::RelayDatagramStatus::Ok || second != PacketBytes( { 0x09 } ) ) {
    std::cerr << "outbound input packets mismatch\n";
    return 1;
  }

  frame = MoshCoreFrame {};
  if ( session.resize( 80, 24, frame ) != MoshRelaySessionStatus::Ok
       || server_relay.receive( first ) != hovvi::mosh::RelayDatagramStatus::Ok || first != PacketBytes( { 80, 24 } ) ) {
    std::cerr << "resize packet mismatch\n";
    return 1;
  }

  frame = MoshCoreFrame {};
  if ( session.tick( 511, frame ) != MoshRelaySessionStatus::Ok
       || server_relay.receive( first ) != hovvi::mosh::RelayDatagramStatus::Ok || first != PacketBytes( { 0xff } ) ) {
    std::cerr << "tick packet mismatch\n";
    return 1;
  }

  frame = MoshCoreFrame {};
  if ( session.shutdown( frame ) != MoshRelaySessionStatus::Ok || !frame.clean_shutdown ) {
    std::cerr << "shutdown frame mismatch\n";
    return 1;
  }

  InProcessPacketChannel small_channel;
  RelayDatagramEndpoint small_relay( small_channel.client(), 1 );
  FakeCore oversize_core;
  MoshRelaySession oversize_session( oversize_core, small_relay );
  frame = MoshCoreFrame {};
  if ( oversize_session.send_user_input( { 0x01, 0x02 }, frame ) != MoshRelaySessionStatus::RelayError ) {
    std::cerr << "oversize relay send did not fail\n";
    return 1;
  }

  InProcessPacketChannel failing_channel;
  RelayDatagramEndpoint failing_client( failing_channel.client(), 8 );
  RelayDatagramEndpoint failing_server( failing_channel.server(), 8 );
  FailingCore failing_core;
  MoshRelaySession failing_session( failing_core, failing_client );
  if ( failing_server.send( { 0x01 } ) != hovvi::mosh::RelayDatagramStatus::Ok ) {
    std::cerr << "failing setup send failed\n";
    return 1;
  }
  frame = MoshCoreFrame {};
  if ( failing_session.pump_inbound( frame ) != MoshRelaySessionStatus::CoreError ) {
    std::cerr << "core error was not reported\n";
    return 1;
  }

  std::cout << "hovvi relay session smoke passed\n";
  return 0;
}
