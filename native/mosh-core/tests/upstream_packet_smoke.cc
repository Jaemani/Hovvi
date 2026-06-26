#include "src/network/network.h"

#include <iostream>
#include <string>

int main()
{
  Network::Packet outbound( Network::TO_SERVER, 123, 456, "relay payload" );
  Crypto::Message encoded = outbound.toMessage();
  Network::Packet inbound( encoded );

  if ( inbound.direction != Network::TO_SERVER || inbound.timestamp != 123 || inbound.timestamp_reply != 456
       || inbound.payload != "relay payload" ) {
    std::cerr << "packet round trip mismatch\n";
    return 1;
  }

  int low = 0;
  int high = 0;
  if ( !Network::Connection::parse_portrange( "60001:60003", low, high ) || low != 60001 || high != 60003 ) {
    std::cerr << "valid port range rejected\n";
    return 1;
  }

  if ( Network::timestamp_diff( 10, 65530 ) != 16 ) {
    std::cerr << "timestamp wrap diff mismatch\n";
    return 1;
  }

  std::cout << "hovvi upstream mosh packet smoke passed\n";
  return 0;
}
