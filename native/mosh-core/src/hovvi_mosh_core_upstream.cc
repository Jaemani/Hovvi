#include "hovvi_mosh_core.h"

#include "src/crypto/crypto.h"
#include "src/network/network.h"
#include "src/protobufs/hostinput.pb.h"
#include "src/statesync/completeterminal.h"
#include "src/statesync/user.h"
#include "src/terminal/terminaldisplay.h"
#include "src/terminal/terminalframebuffer.h"

#include <cstdlib>
#include <cstring>
#include <new>
#include <string>

struct hovvi_mosh_core {
  std::string printable_key;
  hovvi_mosh_terminal_size_t initial_size;
  Crypto::Base64Key key;
  Crypto::Session inbound;
  Crypto::Session outbound;
  Terminal::Complete remote_terminal;
  Terminal::Framebuffer rendered_frame;
  Terminal::Display display;
  bool rendered_once;
};

namespace {
bool is_valid_printable_key( const char* value )
{
  if ( value == nullptr || strlen( value ) != 22 ) {
    return false;
  }
  for ( size_t i = 0; i < 22; i++ ) {
    const char ch = value[i];
    const bool alpha = ( ch >= 'A' && ch <= 'Z' ) || ( ch >= 'a' && ch <= 'z' );
    const bool digit = ch >= '0' && ch <= '9';
    const bool symbol = ch == '+' || ch == '/';
    if ( !alpha && !digit && !symbol ) {
      return false;
    }
  }
  return true;
}

void clear_frame( hovvi_mosh_frame_t* frame )
{
  frame->terminal_output.data = nullptr;
  frame->terminal_output.len = 0;
  frame->outbound_packets = nullptr;
  frame->outbound_packet_count = 0;
  frame->next_tick_ms = 0;
  frame->clean_shutdown = 0;
}

hovvi_mosh_status_t set_terminal_output( hovvi_mosh_frame_t* frame, const std::string& output )
{
  if ( output.empty() ) {
    return HOVVI_MOSH_OK;
  }

  uint8_t* data = static_cast<uint8_t*>( malloc( output.size() ) );
  if ( data == nullptr ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  }
  memcpy( data, output.data(), output.size() );
  frame->terminal_output.data = data;
  frame->terminal_output.len = output.size();
  return HOVVI_MOSH_OK;
}

hovvi_mosh_status_t set_one_outbound_packet( hovvi_mosh_frame_t* frame, const std::string& packet )
{
  hovvi_mosh_bytes_t* packets = static_cast<hovvi_mosh_bytes_t*>( calloc( 1, sizeof( hovvi_mosh_bytes_t ) ) );
  if ( packets == nullptr ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  }

  uint8_t* data = nullptr;
  if ( !packet.empty() ) {
    data = static_cast<uint8_t*>( malloc( packet.size() ) );
    if ( data == nullptr ) {
      free( packets );
      return HOVVI_MOSH_INTERNAL_ERROR;
    }
    memcpy( data, packet.data(), packet.size() );
  }

  packets[0].data = data;
  packets[0].len = packet.size();
  frame->outbound_packets = packets;
  frame->outbound_packet_count = 1;
  return HOVVI_MOSH_OK;
}

hovvi_mosh_status_t emit_user_stream( hovvi_mosh_core_t* core, const Network::UserStream& stream, hovvi_mosh_frame_t* frame )
{
  const std::string payload = stream.init_diff();
  Network::Packet packet( Network::TO_SERVER, Network::timestamp16(), static_cast<uint16_t>( -1 ), payload );
  const std::string encrypted = core->outbound.encrypt( packet.toMessage() );
  return set_one_outbound_packet( frame, encrypted );
}
}

extern "C" {

const char* hovvi_mosh_status_name( hovvi_mosh_status_t status )
{
  switch ( status ) {
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

hovvi_mosh_status_t hovvi_mosh_core_create( const char* printable_key,
                                            hovvi_mosh_terminal_size_t initial_size,
                                            hovvi_mosh_core_t** out_core )
{
  if ( out_core == nullptr ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  *out_core = nullptr;

  if ( !is_valid_printable_key( printable_key ) || initial_size.columns == 0 || initial_size.rows == 0 ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }

  try {
    Crypto::Base64Key key( printable_key );
    *out_core = new hovvi_mosh_core { printable_key,
                                      initial_size,
                                      key,
                                      Crypto::Session( key ),
                                      Crypto::Session( key ),
                                      Terminal::Complete( initial_size.columns, initial_size.rows ),
                                      Terminal::Framebuffer( initial_size.columns, initial_size.rows ),
                                      Terminal::Display( false ),
                                      false };
    return HOVVI_MOSH_OK;
  } catch ( const Crypto::CryptoException& ) {
    return HOVVI_MOSH_CRYPTO_ERROR;
  } catch ( const std::bad_alloc& ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  } catch ( const std::exception& ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  }
}

hovvi_mosh_status_t hovvi_mosh_core_receive_packet( hovvi_mosh_core_t* core,
                                                    hovvi_mosh_bytes_t packet,
                                                    hovvi_mosh_frame_t* out_frame )
{
  if ( core == nullptr || out_frame == nullptr || ( packet.len > 0 && packet.data == nullptr ) ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame( out_frame );

  try {
    const std::string ciphertext( reinterpret_cast<const char*>( packet.data ), packet.len );
    const Crypto::Message message = core->inbound.decrypt( ciphertext );
    const Network::Packet mosh_packet( message );

    if ( mosh_packet.direction != Network::TO_CLIENT ) {
      return HOVVI_MOSH_PROTOCOL_ERROR;
    }

    HostBuffers::HostMessage host_message;
    if ( !host_message.ParseFromString( mosh_packet.payload ) ) {
      return HOVVI_MOSH_PROTOCOL_ERROR;
    }

    core->remote_terminal.apply_string( mosh_packet.payload );
    const Terminal::Framebuffer& next_frame = core->remote_terminal.get_fb();
    const std::string output
      = core->display.new_frame( core->rendered_once, core->rendered_frame, next_frame );
    core->rendered_frame = next_frame;
    core->rendered_once = true;

    return set_terminal_output( out_frame, output );
  } catch ( const Crypto::CryptoException& ) {
    return HOVVI_MOSH_CRYPTO_ERROR;
  } catch ( const Network::NetworkException& ) {
    return HOVVI_MOSH_PROTOCOL_ERROR;
  } catch ( const std::exception& ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  }
}

hovvi_mosh_status_t hovvi_mosh_core_send_user_input( hovvi_mosh_core_t* core,
                                                     hovvi_mosh_bytes_t input,
                                                     hovvi_mosh_frame_t* out_frame )
{
  if ( core == nullptr || out_frame == nullptr || ( input.len > 0 && input.data == nullptr ) ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame( out_frame );
  try {
    Network::UserStream stream;
    for ( size_t i = 0; i < input.len; i++ ) {
      stream.push_back( Parser::UserByte( input.data[i] ) );
    }
    return emit_user_stream( core, stream, out_frame );
  } catch ( const Crypto::CryptoException& ) {
    return HOVVI_MOSH_CRYPTO_ERROR;
  } catch ( const std::bad_alloc& ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  } catch ( const std::exception& ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  }
}

hovvi_mosh_status_t hovvi_mosh_core_resize( hovvi_mosh_core_t* core,
                                            hovvi_mosh_terminal_size_t size,
                                            hovvi_mosh_frame_t* out_frame )
{
  if ( core == nullptr || out_frame == nullptr || size.columns == 0 || size.rows == 0 ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame( out_frame );
  try {
    Network::UserStream stream;
    stream.push_back( Parser::Resize( size.columns, size.rows ) );
    return emit_user_stream( core, stream, out_frame );
  } catch ( const Crypto::CryptoException& ) {
    return HOVVI_MOSH_CRYPTO_ERROR;
  } catch ( const std::bad_alloc& ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  } catch ( const std::exception& ) {
    return HOVVI_MOSH_INTERNAL_ERROR;
  }
}

hovvi_mosh_status_t hovvi_mosh_core_tick( hovvi_mosh_core_t* core, uint64_t now_ms, hovvi_mosh_frame_t* out_frame )
{
  (void)now_ms;
  if ( core == nullptr || out_frame == nullptr ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame( out_frame );
  return HOVVI_MOSH_UNAVAILABLE;
}

hovvi_mosh_status_t hovvi_mosh_core_shutdown( hovvi_mosh_core_t* core, hovvi_mosh_frame_t* out_frame )
{
  if ( core == nullptr || out_frame == nullptr ) {
    return HOVVI_MOSH_INVALID_ARGUMENT;
  }
  clear_frame( out_frame );
  return HOVVI_MOSH_UNAVAILABLE;
}

void hovvi_mosh_frame_free( hovvi_mosh_frame_t* frame )
{
  if ( frame == nullptr ) {
    return;
  }
  free( const_cast<uint8_t*>( frame->terminal_output.data ) );
  if ( frame->outbound_packets != nullptr ) {
    for ( size_t i = 0; i < frame->outbound_packet_count; i++ ) {
      free( const_cast<uint8_t*>( frame->outbound_packets[i].data ) );
    }
  }
  free( frame->outbound_packets );
  clear_frame( frame );
}

void hovvi_mosh_core_destroy( hovvi_mosh_core_t* core )
{
  delete core;
}
}
