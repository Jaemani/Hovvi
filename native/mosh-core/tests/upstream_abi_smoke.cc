#include "hovvi_mosh_core.h"
#include "src/crypto/crypto.h"
#include "src/network/network.h"

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

  Network::Packet server_packet( Network::TO_CLIENT, 111, 222, "server payload" );
  const std::string encrypted = server_crypto.encrypt( server_packet.toMessage() );

  hovvi_mosh_frame_t frame;
  hovvi_mosh_bytes_t packet = {
    .data = reinterpret_cast<const uint8_t*>( encrypted.data() ),
    .len = encrypted.size(),
  };

  failures += require( hovvi_mosh_core_receive_packet( core, packet, &frame ) == HOVVI_MOSH_OK,
                       "server packet should decrypt through ABI" )
                ? 0
                : 1;
  failures += require( frame.terminal_output.data == nullptr, "packet-only slice should not emit terminal output" ) ? 0 : 1;
  failures += require( frame.outbound_packets == nullptr, "packet-only slice should not emit outbound packets" ) ? 0 : 1;
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

  failures += require( hovvi_mosh_core_send_user_input( core, { .data = nullptr, .len = 0 }, &frame )
                         == HOVVI_MOSH_UNAVAILABLE,
                       "input remains unavailable until state sync is linked" )
                ? 0
                : 1;
  hovvi_mosh_frame_free( &frame );

  hovvi_mosh_core_destroy( core );

  if ( failures == 0 ) {
    std::cout << "hovvi upstream ABI smoke passed\n";
  }
  return failures == 0 ? 0 : 1;
}
