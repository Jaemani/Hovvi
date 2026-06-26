#include "hovvi_c_abi_mosh_driver.h"
#include "hovvi_mosh_relay_session.h"

#include <cstdlib>
#include <cstring>
#include <iostream>
#include <vector>

namespace {
struct FakeCore
{
  int id;
};

int destroy_count = 0;

hovvi_mosh_status_t fake_create( const char* printable_key,
                                 hovvi_mosh_terminal_size_t initial_size,
                                 hovvi_mosh_core_t** out_core )
{
  if ( printable_key == nullptr || std::strlen( printable_key ) != 22 || initial_size.columns == 0
       || initial_size.rows == 0 || out_core == nullptr ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  *out_core = reinterpret_cast<hovvi_mosh_core_t*>( new FakeCore { 7 } );
  return HOVVI_MOSH_OK;
}

hovvi_mosh_status_t fake_create_unavailable( const char*,
                                             hovvi_mosh_terminal_size_t,
                                             hovvi_mosh_core_t** out_core )
{
  if ( out_core != nullptr ) {
    *out_core = nullptr;
  }
  return HOVVI_MOSH_UNAVAILABLE;
}

hovvi_mosh_status_t fill_frame( hovvi_mosh_frame_t* frame,
                                const uint8_t* terminal,
                                size_t terminal_len,
                                const std::vector<hovvi::mosh::PacketBytes>& packets,
                                uint32_t next_tick_ms,
                                bool clean_shutdown )
{
  frame->terminal_output = { nullptr, 0 };
  frame->outbound_packets = nullptr;
  frame->outbound_packet_count = 0;
  frame->next_tick_ms = next_tick_ms;
  frame->clean_shutdown = clean_shutdown ? 1 : 0;

  if ( terminal_len > 0 ) {
    uint8_t* output = static_cast<uint8_t*>( std::malloc( terminal_len ) );
    if ( output == nullptr ) {
      return HOVVI_MOSH_INTERNAL_ERROR;
    }
    std::memcpy( output, terminal, terminal_len );
    frame->terminal_output = { output, terminal_len };
  }

  if ( !packets.empty() ) {
    frame->outbound_packets = static_cast<hovvi_mosh_bytes_t*>( std::calloc( packets.size(), sizeof( hovvi_mosh_bytes_t ) ) );
    if ( frame->outbound_packets == nullptr ) {
      return HOVVI_MOSH_INTERNAL_ERROR;
    }
    frame->outbound_packet_count = packets.size();
    for ( size_t i = 0; i < packets.size(); i++ ) {
      if ( packets[i].empty() ) {
        continue;
      }
      uint8_t* packet = static_cast<uint8_t*>( std::malloc( packets[i].size() ) );
      if ( packet == nullptr ) {
        return HOVVI_MOSH_INTERNAL_ERROR;
      }
      std::memcpy( packet, packets[i].data(), packets[i].size() );
      frame->outbound_packets[i] = { packet, packets[i].size() };
    }
  }

  return HOVVI_MOSH_OK;
}

hovvi_mosh_status_t fake_receive_packet( hovvi_mosh_core_t*,
                                         hovvi_mosh_bytes_t packet,
                                         hovvi_mosh_frame_t* out_frame )
{
  return fill_frame( out_frame,
                     packet.data,
                     packet.len,
                     { hovvi::mosh::PacketBytes { 0x0a, 0x0b } },
                     33,
                     false );
}

hovvi_mosh_status_t fake_send_user_input( hovvi_mosh_core_t*, hovvi_mosh_bytes_t input, hovvi_mosh_frame_t* out_frame )
{
  return fill_frame( out_frame, nullptr, 0, { hovvi::mosh::PacketBytes( input.data, input.data + input.len ) }, 44, false );
}

hovvi_mosh_status_t fake_resize( hovvi_mosh_core_t*,
                                 hovvi_mosh_terminal_size_t size,
                                 hovvi_mosh_frame_t* out_frame )
{
  return fill_frame( out_frame,
                     nullptr,
                     0,
                     { hovvi::mosh::PacketBytes { static_cast<uint8_t>( size.columns ), static_cast<uint8_t>( size.rows ) } },
                     55,
                     false );
}

hovvi_mosh_status_t fake_tick( hovvi_mosh_core_t*, uint64_t now_ms, hovvi_mosh_frame_t* out_frame )
{
  return fill_frame( out_frame, nullptr, 0, { hovvi::mosh::PacketBytes { static_cast<uint8_t>( now_ms & 0xff ) } }, 66, false );
}

hovvi_mosh_status_t fake_shutdown( hovvi_mosh_core_t*, hovvi_mosh_frame_t* out_frame )
{
  return fill_frame( out_frame, nullptr, 0, {}, 0, true );
}

void fake_frame_free( hovvi_mosh_frame_t* frame )
{
  std::free( const_cast<uint8_t*>( frame->terminal_output.data ) );
  if ( frame->outbound_packets != nullptr ) {
    for ( size_t i = 0; i < frame->outbound_packet_count; i++ ) {
      std::free( const_cast<uint8_t*>( frame->outbound_packets[i].data ) );
    }
  }
  std::free( frame->outbound_packets );
  *frame = {};
}

void fake_destroy( hovvi_mosh_core_t* core )
{
  destroy_count++;
  delete reinterpret_cast<FakeCore*>( core );
}

hovvi::mosh::CAbiMoshCoreFunctions fake_functions( hovvi_mosh_status_t ( *create_fn )(
  const char*, hovvi_mosh_terminal_size_t, hovvi_mosh_core_t** ) = fake_create )
{
  return hovvi::mosh::CAbiMoshCoreFunctions {
    create_fn,
    fake_receive_packet,
    fake_send_user_input,
    fake_resize,
    fake_tick,
    fake_shutdown,
    fake_frame_free,
    fake_destroy,
  };
}
}

int main()
{
  using hovvi::mosh::CAbiMoshCoreDriver;
  using hovvi::mosh::InProcessPacketChannel;
  using hovvi::mosh::MoshCoreFrame;
  using hovvi::mosh::MoshCoreStatus;
  using hovvi::mosh::MoshRelaySession;
  using hovvi::mosh::MoshRelaySessionStatus;
  using hovvi::mosh::PacketBytes;
  using hovvi::mosh::RelayDatagramEndpoint;

  {
    CAbiMoshCoreDriver unavailable( "AAAAAAAAAAAAAAAAAAAAAA", 80, 24, fake_functions( fake_create_unavailable ) );
    if ( unavailable.available() || unavailable.create_status() != MoshCoreStatus::Unavailable ) {
      std::cerr << "unavailable create status mismatch\n";
      return 1;
    }
    MoshCoreFrame frame;
    if ( unavailable.tick( 1, frame ) != MoshCoreStatus::Unavailable ) {
      std::cerr << "unavailable driver did not preserve create status\n";
      return 1;
    }
  }

  {
    CAbiMoshCoreDriver driver( "AAAAAAAAAAAAAAAAAAAAAA", 80, 24, fake_functions() );
    if ( !driver.available() || driver.create_status() != MoshCoreStatus::Ok || driver.core() == nullptr ) {
      std::cerr << "driver create mismatch\n";
      return 1;
    }

    InProcessPacketChannel channel;
    RelayDatagramEndpoint client_relay( channel.client(), 16 );
    RelayDatagramEndpoint server_relay( channel.server(), 16 );
    MoshRelaySession session( driver, client_relay );
    MoshCoreFrame frame;

    if ( server_relay.send( { 0x01, 0x02, 0x03 } ) != hovvi::mosh::RelayDatagramStatus::Ok ) {
      std::cerr << "setup relay send failed\n";
      return 1;
    }
    if ( session.pump_inbound( frame ) != MoshRelaySessionStatus::Ok || frame.terminal_output != PacketBytes( { 0x01, 0x02, 0x03 } )
         || frame.outbound_packets.size() != 1 || frame.outbound_packets[0] != PacketBytes( { 0x0a, 0x0b } )
         || frame.next_tick_ms != 33 ) {
      std::cerr << "driver inbound frame mismatch\n";
      return 1;
    }

    frame = MoshCoreFrame {};
    if ( session.send_user_input( { 0x04, 0x05 }, frame ) != MoshRelaySessionStatus::Ok
         || server_relay.receive( frame.terminal_output ) != hovvi::mosh::RelayDatagramStatus::Ok
         || frame.terminal_output != PacketBytes( { 0x0a, 0x0b } ) ) {
      std::cerr << "prior inbound outbound packet was not flushed\n";
      return 1;
    }
    PacketBytes input_packet;
    if ( server_relay.receive( input_packet ) != hovvi::mosh::RelayDatagramStatus::Ok
         || input_packet != PacketBytes( { 0x04, 0x05 } ) ) {
      std::cerr << "input outbound packet mismatch\n";
      return 1;
    }

    frame = MoshCoreFrame {};
    if ( driver.resize( 80, 24, frame ) != MoshCoreStatus::Ok || frame.outbound_packets.size() != 1
         || frame.outbound_packets[0] != PacketBytes( { 80, 24 } ) || frame.next_tick_ms != 55 ) {
      std::cerr << "resize frame mismatch\n";
      return 1;
    }

    frame = MoshCoreFrame {};
    if ( driver.tick( 511, frame ) != MoshCoreStatus::Ok || frame.outbound_packets.size() != 1
         || frame.outbound_packets[0] != PacketBytes( { 0xff } ) || frame.next_tick_ms != 66 ) {
      std::cerr << "tick frame mismatch\n";
      return 1;
    }

    frame = MoshCoreFrame {};
    if ( driver.shutdown( frame ) != MoshCoreStatus::Ok || !frame.clean_shutdown ) {
      std::cerr << "shutdown frame mismatch\n";
      return 1;
    }
  }

  if ( destroy_count != 1 ) {
    std::cerr << "owned core destroy mismatch\n";
    return 1;
  }

  std::cout << "hovvi C ABI driver smoke passed\n";
  return 0;
}
