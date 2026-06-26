#include "hovvi_mosh_relay_transport_upstream.h"
#include "hovvi_packet_io.h"
#include "hovvi_relay_datagram.h"

#include "src/crypto/crypto.h"
#include "src/network/network.h"
#include "src/network/transportfragment.h"
#include "src/protobufs/transportinstruction.pb.h"
#include "src/statesync/completeterminal.h"
#include "src/statesync/user.h"
#include "src/terminal/terminal.h"

#include <iostream>
#include <string>
#include <vector>

namespace {
using hovvi::mosh::InProcessPacketChannel;
using hovvi::mosh::PacketBytes;
using hovvi::mosh::RelayDatagramEndpoint;
using hovvi::mosh::RelayDatagramStatus;
using hovvi::mosh::upstream::RelayTransportClient;
using hovvi::mosh::upstream::RelayTransportFrame;
using hovvi::mosh::upstream::RelayTransportStatus;

std::string to_string( const PacketBytes& bytes )
{
  return std::string( bytes.begin(), bytes.end() );
}

PacketBytes to_bytes( const std::string& value )
{
  return PacketBytes( value.begin(), value.end() );
}

bool require( bool condition, const char* message )
{
  if ( !condition ) {
    std::cerr << "FAIL: " << message << "\n";
    return false;
  }
  return true;
}

TransportBuffers::Instruction decrypt_transport_instruction( RelayDatagramEndpoint& endpoint,
                                                             Crypto::Session& crypto )
{
  PacketBytes datagram;
  if ( endpoint.receive( datagram ) != RelayDatagramStatus::Ok ) {
    throw std::runtime_error( "missing relay datagram" );
  }

  const Crypto::Message message = crypto.decrypt( to_string( datagram ) );
  const Network::Packet packet( message );
  if ( packet.direction != Network::TO_SERVER ) {
    throw std::runtime_error( "unexpected packet direction" );
  }

  Network::Fragment fragment( packet.payload );
  Network::FragmentAssembly assembly;
  if ( !assembly.add_fragment( fragment ) ) {
    throw std::runtime_error( "single-fragment instruction did not assemble" );
  }
  return assembly.get_assembly();
}

void send_server_instruction( RelayDatagramEndpoint& endpoint,
                              Crypto::Session& crypto,
                              const TransportBuffers::Instruction& instruction )
{
  Network::Fragmenter fragmenter;
  std::vector<Network::Fragment> fragments = fragmenter.make_fragments( instruction, 1000 );
  for ( Network::Fragment& fragment : fragments ) {
    Network::Packet packet( Network::TO_CLIENT, Network::timestamp16(), static_cast<uint16_t>( -1 ), fragment.tostring() );
    endpoint.send( to_bytes( crypto.encrypt( packet.toMessage() ) ) );
  }
}
}

int main()
{
  int failures = 0;
  const char* key_text = "AAAAAAAAAAAAAAAAAAAAAA";
  Crypto::Base64Key key( key_text );
  Crypto::Session server_crypto( key );

  InProcessPacketChannel channel;
  RelayDatagramEndpoint client_relay( channel.client(), 1200 );
  RelayDatagramEndpoint server_relay( channel.server(), 1200 );
  RelayTransportClient client( key_text, client_relay, 80, 24 );

  failures += require( client.send_user_input( "ok" ) == RelayTransportStatus::Ok,
                       "client input should produce relay transport datagram" )
                ? 0
                : 1;
  try {
    TransportBuffers::Instruction input_instruction = decrypt_transport_instruction( server_relay, server_crypto );
    Network::UserStream input_stream;
    input_stream.apply_string( input_instruction.diff() );
    failures += require( input_instruction.protocol_version() == Network::MOSH_PROTOCOL_VERSION,
                         "input instruction should carry mosh protocol version" )
                  ? 0
                  : 1;
    failures += require( input_instruction.old_num() == 0 && input_instruction.new_num() == 1,
                         "input instruction should advance client state" )
                  ? 0
                  : 1;
    failures += require( input_stream.size() == 2, "input instruction should contain two user bytes" ) ? 0 : 1;
  } catch ( const std::exception& e ) {
    std::cerr << "FAIL: could not decrypt input instruction: " << e.what() << "\n";
    failures++;
  }

  Terminal::Complete server_terminal( 80, 24 );
  server_terminal.act( "relay transport payload" );
  TransportBuffers::Instruction terminal_instruction;
  terminal_instruction.set_protocol_version( Network::MOSH_PROTOCOL_VERSION );
  terminal_instruction.set_old_num( 0 );
  terminal_instruction.set_new_num( 1 );
  terminal_instruction.set_ack_num( client.sent_state_num() );
  terminal_instruction.set_throwaway_num( 0 );
  terminal_instruction.set_diff( server_terminal.init_diff() );
  send_server_instruction( server_relay, server_crypto, terminal_instruction );

  RelayTransportFrame frame;
  failures += require( client.pump_inbound( frame ) == RelayTransportStatus::Ok,
                       "client should receive relay transport instruction" )
                ? 0
                : 1;
  failures += require( frame.terminal_output.find( "relay transport payload" ) != std::string::npos,
                       "client should render terminal output from relay transport instruction" )
                ? 0
                : 1;
  failures += require( frame.remote_state_num == 1, "client should record remote state number" ) ? 0 : 1;
  failures += require( frame.ack_num == client.sent_state_num(), "client should observe server ack" ) ? 0 : 1;

  failures += require( client.send_resize( 100, 40 ) == RelayTransportStatus::Ok,
                       "client resize should produce relay transport datagram" )
                ? 0
                : 1;
  try {
    TransportBuffers::Instruction resize_instruction = decrypt_transport_instruction( server_relay, server_crypto );
    Network::UserStream resize_stream;
    resize_stream.apply_string( resize_instruction.diff() );
    failures += require( resize_instruction.ack_num() == client.received_state_num(),
                         "resize should acknowledge received server state" )
                  ? 0
                  : 1;
    failures += require( resize_instruction.new_num() == 2, "resize should advance client state again" ) ? 0 : 1;
    failures += require( resize_stream.size() == 1, "resize instruction should contain one user event" ) ? 0 : 1;
  } catch ( const std::exception& e ) {
    std::cerr << "FAIL: could not decrypt resize instruction: " << e.what() << "\n";
    failures++;
  }

  failures += require( client.send_shutdown() == RelayTransportStatus::Ok,
                       "client shutdown should produce relay transport datagram" )
                ? 0
                : 1;
  try {
    TransportBuffers::Instruction shutdown_instruction = decrypt_transport_instruction( server_relay, server_crypto );
    failures += require( shutdown_instruction.new_num() == uint64_t( -1 ),
                         "shutdown instruction should use mosh shutdown state number" )
                  ? 0
                  : 1;
  } catch ( const std::exception& e ) {
    std::cerr << "FAIL: could not decrypt shutdown instruction: " << e.what() << "\n";
    failures++;
  }

  PacketBytes bad_datagram = { 0x01, 0x02, 0x03 };
  server_relay.send( bad_datagram );
  failures += require( client.pump_inbound( frame ) == RelayTransportStatus::CryptoError,
                       "bad encrypted relay transport datagram should be crypto error" )
                ? 0
                : 1;

  if ( failures == 0 ) {
    std::cout << "hovvi upstream relay transport smoke passed\n";
  }
  return failures == 0 ? 0 : 1;
}
