#ifndef HOVVI_MOSH_CORE_RELAY_DATAGRAM_H
#define HOVVI_MOSH_CORE_RELAY_DATAGRAM_H

#include <cstddef>
#include <utility>

#include "hovvi_packet_io.h"

namespace hovvi::mosh {

enum class RelayDatagramStatus
{
  Ok,
  Empty,
  NoPeer,
  Oversize,
};

class RelayDatagramEndpoint
{
public:
  RelayDatagramEndpoint( PacketEndpoint& endpoint, size_t max_datagram_bytes )
    : endpoint_( endpoint ), max_datagram_bytes_( max_datagram_bytes )
  {}

  RelayDatagramStatus send( PacketBytes packet )
  {
    if ( packet.size() > max_datagram_bytes_ ) {
      return RelayDatagramStatus::Oversize;
    }
    if ( !endpoint_.send( std::move( packet ) ) ) {
      return RelayDatagramStatus::NoPeer;
    }
    return RelayDatagramStatus::Ok;
  }

  RelayDatagramStatus receive( PacketBytes& out_packet )
  {
    if ( !endpoint_.receive( out_packet ) ) {
      return RelayDatagramStatus::Empty;
    }
    return RelayDatagramStatus::Ok;
  }

  size_t pending() const { return endpoint_.pending(); }
  size_t max_datagram_bytes() const { return max_datagram_bytes_; }

private:
  PacketEndpoint& endpoint_;
  size_t max_datagram_bytes_;
};

}  // namespace hovvi::mosh

#endif
