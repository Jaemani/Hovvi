#ifndef HOVVI_UDP_DATAGRAM_ENDPOINT_H
#define HOVVI_UDP_DATAGRAM_ENDPOINT_H

#include "hovvi_packet_io.h"
#include "hovvi_relay_datagram.h"

#include <cerrno>
#include <cstddef>
#include <cstring>
#include <string>

#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

namespace hovvi::mosh {

class UdpDatagramEndpoint
{
public:
  UdpDatagramEndpoint( const char* remote_host, uint16_t remote_port, size_t max_datagram_bytes = 1200 )
    : fd_( -1 ), max_datagram_bytes_( max_datagram_bytes )
  {
    fd_ = socket( AF_INET, SOCK_DGRAM, 0 );
    if ( fd_ < 0 ) {
      last_error_ = std::string( "socket: " ) + strerror( errno );
      return;
    }

    int flags = fcntl( fd_, F_GETFL, 0 );
    if ( flags >= 0 ) {
      fcntl( fd_, F_SETFL, flags | O_NONBLOCK );
    }

    sockaddr_in remote {};
    remote.sin_family = AF_INET;
    remote.sin_port = htons( remote_port );
    if ( inet_pton( AF_INET, remote_host, &remote.sin_addr ) != 1 ) {
      last_error_ = "invalid IPv4 remote host";
      close_fd();
      return;
    }
    if ( connect( fd_, reinterpret_cast<sockaddr*>( &remote ), sizeof( remote ) ) != 0 ) {
      last_error_ = std::string( "connect: " ) + strerror( errno );
      close_fd();
    }
  }

  ~UdpDatagramEndpoint() { close_fd(); }

  UdpDatagramEndpoint( const UdpDatagramEndpoint& ) = delete;
  UdpDatagramEndpoint& operator=( const UdpDatagramEndpoint& ) = delete;

  RelayDatagramStatus send( const PacketBytes& packet )
  {
    if ( fd_ < 0 ) {
      return RelayDatagramStatus::NoPeer;
    }
    if ( packet.size() > max_datagram_bytes_ ) {
      return RelayDatagramStatus::Oversize;
    }
    const ssize_t written = ::send( fd_, packet.data(), packet.size(), 0 );
    if ( written != static_cast<ssize_t>( packet.size() ) ) {
      last_error_ = std::string( "send: " ) + strerror( errno );
      return RelayDatagramStatus::NoPeer;
    }
    return RelayDatagramStatus::Ok;
  }

  RelayDatagramStatus receive( PacketBytes& out_packet )
  {
    if ( fd_ < 0 ) {
      return RelayDatagramStatus::NoPeer;
    }
    uint8_t buffer[65507];
    const ssize_t received = recv( fd_, buffer, sizeof( buffer ), 0 );
    if ( received < 0 ) {
      if ( errno == EAGAIN || errno == EWOULDBLOCK ) {
        return RelayDatagramStatus::Empty;
      }
      last_error_ = std::string( "recv: " ) + strerror( errno );
      return RelayDatagramStatus::NoPeer;
    }
    out_packet.assign( buffer, buffer + received );
    return RelayDatagramStatus::Ok;
  }

  bool ok() const { return fd_ >= 0; }
  const std::string& last_error() const { return last_error_; }
  size_t max_datagram_bytes() const { return max_datagram_bytes_; }

private:
  void close_fd()
  {
    if ( fd_ >= 0 ) {
      close( fd_ );
      fd_ = -1;
    }
  }

  int fd_;
  size_t max_datagram_bytes_;
  std::string last_error_;
};

}  // namespace hovvi::mosh

#endif
