#include "hovvi_mosh_relay_transport_upstream.h"
#include "hovvi_udp_datagram_endpoint.h"

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <limits>
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

void fail_status( hovvi::mosh::upstream::RelayTransportStatus status,
                  const hovvi::mosh::UdpDatagramEndpoint& endpoint )
{
  std::cerr << "transport receive failed: " << status_name( status ) << "\n";
  if ( !endpoint.last_error().empty() ) {
    std::cerr << endpoint.last_error() << "\n";
  }
}

bool pump_until_output( hovvi::mosh::upstream::BasicRelayTransportClient<hovvi::mosh::UdpDatagramEndpoint>& client,
                        hovvi::mosh::UdpDatagramEndpoint& endpoint,
                        const std::string& expected,
                        int timeout_ms,
                        bool verbose )
{
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
      if ( output.find( expected ) != std::string::npos ) {
        return true;
      }
    } else if ( status != hovvi::mosh::upstream::RelayTransportStatus::Empty ) {
      fail_status( status, endpoint );
      return false;
    }
    std::this_thread::sleep_for( std::chrono::milliseconds( 20 ) );
  }
  std::cerr << "timed out waiting for expected output: " << expected << "\n";
  return false;
}

bool pump_until_shutdown_ack( hovvi::mosh::upstream::BasicRelayTransportClient<hovvi::mosh::UdpDatagramEndpoint>& client,
                              hovvi::mosh::UdpDatagramEndpoint& endpoint,
                              int timeout_ms,
                              bool verbose )
{
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds( timeout_ms );
  hovvi::mosh::upstream::RelayTransportFrame frame;
  while ( std::chrono::steady_clock::now() < deadline ) {
    const hovvi::mosh::upstream::RelayTransportStatus status = client.pump_inbound( frame );
    if ( status == hovvi::mosh::upstream::RelayTransportStatus::Ok ) {
      if ( verbose && !frame.terminal_output.empty() ) {
        std::cerr << frame.terminal_output;
      }
      if ( frame.shutdown_acknowledged || frame.ack_num == std::numeric_limits<uint64_t>::max() ) {
        return true;
      }
    } else if ( status != hovvi::mosh::upstream::RelayTransportStatus::Empty ) {
      fail_status( status, endpoint );
      return false;
    }
    std::this_thread::sleep_for( std::chrono::milliseconds( 20 ) );
  }
  std::cerr << "timed out waiting for shutdown acknowledgement\n";
  return false;
}
}

int main( int argc, char** argv )
{
  const char* key = value_arg( argc, argv, "--key" );
  const char* port_text = value_arg( argc, argv, "--port" );
  const char* expect = value_arg( argc, argv, "--expect" );
  const char* input_expect = value_arg( argc, argv, "--input-expect" );
  const char* paste_expect = value_arg( argc, argv, "--paste-expect" );
  const int timeout_ms = value_arg( argc, argv, "--timeout-ms" ) ? std::atoi( value_arg( argc, argv, "--timeout-ms" ) ) : 5000;
  const bool verbose = has_arg( argc, argv, "--verbose" );

  if ( key == nullptr || port_text == nullptr || expect == nullptr ) {
    std::cerr << "Usage: upstream_mosh_server_probe --key <22-char-key> --port <udp-port> --expect <text> [--input-expect <text>] [--paste-expect <text>] [--timeout-ms 5000]\n";
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

  if ( !pump_until_output( client, endpoint, expect, timeout_ms, verbose ) ) {
    return 1;
  }

  client.send_resize( 100, 40 );

  if ( input_expect != nullptr ) {
    const std::string command = "printf '" + std::string( input_expect ) + "\\n'\n";
    if ( client.send_user_input( command ) != hovvi::mosh::upstream::RelayTransportStatus::Ok ) {
      std::cerr << "failed to send input command\n";
      return 1;
    }
    if ( !pump_until_output( client, endpoint, input_expect, timeout_ms, verbose ) ) {
      return 1;
    }
  }

  if ( paste_expect != nullptr ) {
    const std::string filler( 180, 'x' );
    const std::string command = "printf '" + std::string( paste_expect ) + filler + "\\n'\n";
    if ( client.send_user_input( command ) != hovvi::mosh::upstream::RelayTransportStatus::Ok ) {
      std::cerr << "failed to send paste command\n";
      return 1;
    }
    if ( !pump_until_output( client, endpoint, paste_expect, timeout_ms, verbose ) ) {
      return 1;
    }
  }

  if ( client.send_shutdown() != hovvi::mosh::upstream::RelayTransportStatus::Ok ) {
    std::cerr << "failed to send shutdown\n";
    return 1;
  }
  if ( !pump_until_shutdown_ack( client, endpoint, timeout_ms, verbose ) ) {
    return 1;
  }

  std::cout << "hovvi upstream mosh-server probe passed\n";
  return 0;
}
