#include "hovvi_mosh_core.h"
#include "src/crypto/crypto.h"
#include "src/network/network.h"
#include "src/statesync/completeterminal.h"
#include "src/statesync/user.h"

#include <cstdint>
#include <iostream>
#include <string>

namespace {
bool require( bool condition, const char* message )
{
  if ( !condition ) {
    std::cerr << "FAIL: " << message << "\n";
    return false;
  }
  return true;
}
}

int main()
{
  int failures = 0;
  hovvi_mosh_core_t* core = nullptr;
  hovvi_mosh_terminal_size_t size = { 80, 24 };
  const char* key_text = "AAAAAAAAAAAAAAAAAAAAAA";

  failures += require( hovvi_mosh_core_create( "short", size, &core ) == HOVVI_MOSH_INVALID_ARGUMENT,
                       "short key should be invalid" )
                ? 0
                : 1;
  failures += require( core == nullptr, "invalid create should not produce core" ) ? 0 : 1;

  failures += require( hovvi_mosh_core_create( key_text, size, &core ) == HOVVI_MOSH_OK,
                       "upstream create should produce core" )
                ? 0
                : 1;
  failures += require( core != nullptr, "valid create should set core" ) ? 0 : 1;
  if ( failures != 0 ) {
    hovvi_mosh_core_destroy( core );
    return 1;
  }

  Crypto::Base64Key key( key_text );
  Crypto::Session server_crypto( key );

  Network::Packet server_packet( Network::TO_CLIENT, 111, 222, "" );
  Terminal::Complete server_terminal( size.columns, size.rows );
  server_terminal.act( "server payload" );
  Network::Packet terminal_packet( Network::TO_CLIENT, 112, 223, server_terminal.init_diff() );
  const std::string encrypted = server_crypto.encrypt( server_packet.toMessage() );
  const std::string encrypted_terminal = server_crypto.encrypt( terminal_packet.toMessage() );

  hovvi_mosh_frame_t frame;
  hovvi_mosh_bytes_t packet = {
    .data = reinterpret_cast<const uint8_t*>( encrypted.data() ),
    .len = encrypted.size(),
  };

  failures += require( hovvi_mosh_core_receive_packet( core, packet, &frame ) == HOVVI_MOSH_OK,
                       "server packet should decrypt through ABI" )
                ? 0
                : 1;
  failures += require( frame.outbound_packets == nullptr, "packet-only slice should not emit outbound packets" ) ? 0 : 1;
  hovvi_mosh_frame_free( &frame );

  Network::Packet malformed_host_diff( Network::TO_CLIENT, 113, 224, "not a host diff" );
  const std::string encrypted_malformed_host_diff = server_crypto.encrypt( malformed_host_diff.toMessage() );
  packet = {
    .data = reinterpret_cast<const uint8_t*>( encrypted_malformed_host_diff.data() ),
    .len = encrypted_malformed_host_diff.size(),
  };
  failures += require( hovvi_mosh_core_receive_packet( core, packet, &frame ) == HOVVI_MOSH_PROTOCOL_ERROR,
                       "malformed host diff should be protocol error" )
                ? 0
                : 1;
  hovvi_mosh_frame_free( &frame );

  packet = {
    .data = reinterpret_cast<const uint8_t*>( encrypted_terminal.data() ),
    .len = encrypted_terminal.size(),
  };
  failures += require( hovvi_mosh_core_receive_packet( core, packet, &frame ) == HOVVI_MOSH_OK,
                       "terminal packet should render through ABI" )
                ? 0
                : 1;
  const std::string terminal_output( reinterpret_cast<const char*>( frame.terminal_output.data ),
                                     frame.terminal_output.len );
  failures += require( terminal_output.find( "server payload" ) != std::string::npos,
                       "terminal output should contain rendered server bytes" )
                ? 0
                : 1;
  failures += require( frame.outbound_packets == nullptr, "terminal receive should not emit outbound packets" ) ? 0 : 1;
  hovvi_mosh_frame_free( &frame );

  const uint8_t invalid_packet[] = { 0x01, 0x02, 0x03 };
  failures += require( hovvi_mosh_core_receive_packet( core,
                                                       { .data = invalid_packet, .len = sizeof( invalid_packet ) },
                                                       &frame )
                         == HOVVI_MOSH_CRYPTO_ERROR,
                       "invalid ciphertext should be crypto error" )
                ? 0
                : 1;
  hovvi_mosh_frame_free( &frame );

  Network::Packet client_packet( Network::TO_SERVER, 333, 444, "wrong direction" );
  const std::string wrong_direction = server_crypto.encrypt( client_packet.toMessage() );
  failures += require( hovvi_mosh_core_receive_packet(
                         core,
                         { .data = reinterpret_cast<const uint8_t*>( wrong_direction.data() ),
                           .len = wrong_direction.size() },
                         &frame )
                         == HOVVI_MOSH_PROTOCOL_ERROR,
                       "wrong direction should be protocol error" )
                ? 0
                : 1;
  hovvi_mosh_frame_free( &frame );

  const uint8_t user_input[] = { 'o', 'k' };
  failures += require( hovvi_mosh_core_send_user_input( core,
                                                        { .data = user_input, .len = sizeof( user_input ) },
                                                        &frame )
                         == HOVVI_MOSH_OK,
                       "input should emit outbound encrypted mosh packet" )
                ? 0
                : 1;
  failures += require( frame.outbound_packet_count == 1, "input should emit one outbound packet" ) ? 0 : 1;
  if ( frame.outbound_packet_count == 1 ) {
    const Crypto::Message input_message
      = server_crypto.decrypt( reinterpret_cast<const char*>( frame.outbound_packets[0].data ),
                               frame.outbound_packets[0].len );
    const Network::Packet input_packet( input_message );
    Network::UserStream input_stream;
    input_stream.apply_string( input_packet.payload );
    failures += require( input_packet.direction == Network::TO_SERVER, "input packet should target server" ) ? 0 : 1;
    failures += require( input_stream.size() == 2, "input stream should contain two bytes" ) ? 0 : 1;
  }
  hovvi_mosh_frame_free( &frame );

  failures += require( hovvi_mosh_core_resize( core, { .columns = 100, .rows = 40 }, &frame ) == HOVVI_MOSH_OK,
                       "resize should emit outbound encrypted mosh packet" )
                ? 0
                : 1;
  failures += require( frame.outbound_packet_count == 1, "resize should emit one outbound packet" ) ? 0 : 1;
  if ( frame.outbound_packet_count == 1 ) {
    const Crypto::Message resize_message
      = server_crypto.decrypt( reinterpret_cast<const char*>( frame.outbound_packets[0].data ),
                               frame.outbound_packets[0].len );
    const Network::Packet resize_packet( resize_message );
    Network::UserStream resize_stream;
    resize_stream.apply_string( resize_packet.payload );
    failures += require( resize_packet.direction == Network::TO_SERVER, "resize packet should target server" ) ? 0 : 1;
    failures += require( resize_stream.size() == 1, "resize stream should contain one event" ) ? 0 : 1;
  }
  hovvi_mosh_frame_free( &frame );

  hovvi_mosh_core_destroy( core );

  if ( failures == 0 ) {
    std::cout << "hovvi upstream ABI smoke passed\n";
  }
  return failures == 0 ? 0 : 1;
}
