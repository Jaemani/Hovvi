#include "hovvi_mosh_relay_transport_upstream.h"
#include "hovvi_udp_datagram_endpoint.h"

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <string>
#include <thread>

namespace {
bool has_arg( int argc, char** argv, const char* name )
{
  for ( int i = 1; i < argc; i++ ) {
    if ( std::string( argv[i] ) == name ) {
      return true;
    }
  }
  return false;
}

const char* value_arg( int argc, char** argv, const char* name )
{
  for ( int i = 1; i + 1 < argc; i++ ) {
    if ( std::string( argv[i] ) == name ) {
      return argv[i + 1];
    }
  }
  return nullptr;
}

const char* status_name( hovvi::mosh::upstream::RelayTransportStatus status )
{
  switch ( status ) {
    case hovvi::mosh::upstream::RelayTransportStatus::Ok:
      return "ok";
    case hovvi::mosh::upstream::RelayTransportStatus::Empty:
      return "empty";
    case hovvi::mosh::upstream::RelayTransportStatus::RelayError:
      return "relay_error";
    case hovvi::mosh::upstream::RelayTransportStatus::CryptoError:
      return "crypto_error";
    case hovvi::mosh::upstream::RelayTransportStatus::ProtocolError:
      return "protocol_error";
    default:
      return "unknown";
  }
}
}

int main( int argc, char** argv )
{
  const char* key = value_arg( argc, argv, "--key" );
  const char* port_text = value_arg( argc, argv, "--port" );
  const char* expect = value_arg( argc, argv, "--expect" );
  const int timeout_ms = value_arg( argc, argv, "--timeout-ms" ) ? std::atoi( value_arg( argc, argv, "--timeout-ms" ) ) : 5000;
  const bool verbose = has_arg( argc, argv, "--verbose" );

  if ( key == nullptr || port_text == nullptr || expect == nullptr ) {
    std::cerr << "Usage: upstream_mosh_server_probe --key <22-char-key> --port <udp-port> --expect <text> [--timeout-ms 5000]\n";
    return 2;
  }

  const int port = std::atoi( port_text );
  if ( port <= 0 || port > 65535 ) {
    std::cerr << "invalid port\n";
    return 2;
  }

  hovvi::mosh::UdpDatagramEndpoint endpoint( "127.0.0.1", static_cast<uint16_t>( port ), 1200 );
  if ( !endpoint.ok() ) {
    std::cerr << endpoint.last_error() << "\n";
    return 2;
  }

  hovvi::mosh::upstream::BasicRelayTransportClient<hovvi::mosh::UdpDatagramEndpoint> client(
    key, endpoint, 80, 24 );
  if ( client.send_resize( 80, 24 ) != hovvi::mosh::upstream::RelayTransportStatus::Ok ) {
    std::cerr << "failed to send initial resize\n";
    return 1;
  }

  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds( timeout_ms );
  std::string output;
  hovvi::mosh::upstream::RelayTransportFrame frame;
  while ( std::chrono::steady_clock::now() < deadline ) {
    const hovvi::mosh::upstream::RelayTransportStatus status = client.pump_inbound( frame );
    if ( status == hovvi::mosh::upstream::RelayTransportStatus::Ok ) {
      output += frame.terminal_output;
      if ( verbose && !frame.terminal_output.empty() ) {
        std::cerr << frame.terminal_output;
      }
      if ( output.find( expect ) != std::string::npos ) {
        std::cout << "hovvi upstream mosh-server probe passed\n";
        return 0;
      }
    } else if ( status != hovvi::mosh::upstream::RelayTransportStatus::Empty ) {
      std::cerr << "transport receive failed: " << status_name( status ) << "\n";
      if ( !endpoint.last_error().empty() ) {
        std::cerr << endpoint.last_error() << "\n";
      }
      return 1;
    }
    std::this_thread::sleep_for( std::chrono::milliseconds( 20 ) );
  }

  std::cerr << "timed out waiting for expected mosh-server output\n";
  return 1;
}
