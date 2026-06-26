#include "hovvi_relay_datagram.h"
#include "src/crypto/crypto.h"
#include "src/network/network.h"

#include <cstdint>
#include <iostream>
#include <string>

namespace {
hovvi::mosh::PacketBytes to_packet_bytes( const std::string& bytes )
{
  return hovvi::mosh::PacketBytes( bytes.begin(), bytes.end() );
}

std::string to_string( const hovvi::mosh::PacketBytes& bytes )
{
  return std::string( bytes.begin(), bytes.end() );
}
}

int main()
{
  using hovvi::mosh::InProcessPacketChannel;
  using hovvi::mosh::PacketBytes;
  using hovvi::mosh::RelayDatagramEndpoint;
  using hovvi::mosh::RelayDatagramStatus;

  try {
    Crypto::Base64Key key( "AAAAAAAAAAAAAAAAAAAAAA" );
    Crypto::Session client_crypto( key );
    Crypto::Session server_crypto( key );

    InProcessPacketChannel channel;
    RelayDatagramEndpoint client( channel.client(), 512 );
    RelayDatagramEndpoint server( channel.server(), 512 );

    Network::Packet outbound( Network::TO_SERVER, 100, 200, "relay-backed mosh payload" );
    const std::string encrypted = client_crypto.encrypt( outbound.toMessage() );

    if ( client.send( to_packet_bytes( encrypted ) ) != RelayDatagramStatus::Ok ) {
      std::cerr << "client relay datagram send failed\n";
      return 1;
    }

    PacketBytes server_datagram;
    if ( server.receive( server_datagram ) != RelayDatagramStatus::Ok ) {
      std::cerr << "server relay datagram receive failed\n";
      return 1;
    }

    const Crypto::Message decrypted = server_crypto.decrypt( to_string( server_datagram ) );
    const Network::Packet inbound( decrypted );

    if ( inbound.direction != Network::TO_SERVER || inbound.timestamp != 100 || inbound.timestamp_reply != 200
         || inbound.payload != "relay-backed mosh payload" ) {
      std::cerr << "server packet mismatch after relay datagram\n";
      return 1;
    }

    Network::Packet reply( Network::TO_CLIENT, 300, 400, "relay-backed mosh reply" );
    const std::string encrypted_reply = server_crypto.encrypt( reply.toMessage() );

    if ( server.send( to_packet_bytes( encrypted_reply ) ) != RelayDatagramStatus::Ok ) {
      std::cerr << "server relay datagram send failed\n";
      return 1;
    }

    PacketBytes client_datagram;
    if ( client.receive( client_datagram ) != RelayDatagramStatus::Ok ) {
      std::cerr << "client relay datagram receive failed\n";
      return 1;
    }

    const Crypto::Message decrypted_reply = client_crypto.decrypt( to_string( client_datagram ) );
    const Network::Packet inbound_reply( decrypted_reply );

    if ( inbound_reply.direction != Network::TO_CLIENT || inbound_reply.timestamp != 300
         || inbound_reply.timestamp_reply != 400 || inbound_reply.payload != "relay-backed mosh reply" ) {
      std::cerr << "client packet mismatch after relay datagram\n";
      return 1;
    }

    RelayDatagramEndpoint small_client( channel.client(), encrypted_reply.size() - 1 );
    if ( small_client.send( to_packet_bytes( encrypted_reply ) ) != RelayDatagramStatus::Oversize ) {
      std::cerr << "oversize encrypted mosh datagram accepted\n";
      return 1;
    }
  } catch ( const std::exception& error ) {
    std::cerr << error.what() << "\n";
    return 1;
  }

  std::cout << "hovvi upstream relay packet smoke passed\n";
  return 0;
}
