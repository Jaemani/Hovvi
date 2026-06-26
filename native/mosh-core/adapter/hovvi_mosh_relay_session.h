#ifndef HOVVI_MOSH_CORE_RELAY_SESSION_H
#define HOVVI_MOSH_CORE_RELAY_SESSION_H

#include <cstdint>
#include <utility>
#include <vector>

#include "hovvi_relay_datagram.h"

namespace hovvi::mosh {

struct MoshCoreFrame
{
  PacketBytes terminal_output;
  std::vector<PacketBytes> outbound_packets;
  uint32_t next_tick_ms = 0;
  bool clean_shutdown = false;
};

enum class MoshCoreStatus
{
  Ok,
  InvalidArgument,
  CryptoError,
  ProtocolError,
  InternalError,
  Unavailable,
};

class MoshCoreDriver
{
public:
  virtual ~MoshCoreDriver() = default;

  virtual MoshCoreStatus receive_packet( const PacketBytes& packet, MoshCoreFrame& frame ) = 0;
  virtual MoshCoreStatus send_user_input( const PacketBytes& input, MoshCoreFrame& frame ) = 0;
  virtual MoshCoreStatus resize( uint32_t columns, uint32_t rows, MoshCoreFrame& frame ) = 0;
  virtual MoshCoreStatus tick( uint64_t now_ms, MoshCoreFrame& frame ) = 0;
  virtual MoshCoreStatus shutdown( MoshCoreFrame& frame ) = 0;
};

enum class MoshRelaySessionStatus
{
  Ok,
  Empty,
  CoreError,
  RelayError,
};

class MoshRelaySession
{
public:
  MoshRelaySession( MoshCoreDriver& core, RelayDatagramEndpoint& relay ) : core_( core ), relay_( relay ) {}

  MoshRelaySessionStatus pump_inbound( MoshCoreFrame& frame )
  {
    PacketBytes packet;
    const RelayDatagramStatus relay_status = relay_.receive( packet );
    if ( relay_status == RelayDatagramStatus::Empty ) {
      return MoshRelaySessionStatus::Empty;
    }
    if ( relay_status != RelayDatagramStatus::Ok ) {
      return MoshRelaySessionStatus::RelayError;
    }
    return map_core_status( core_.receive_packet( packet, frame ), frame );
  }

  MoshRelaySessionStatus send_user_input( PacketBytes input, MoshCoreFrame& frame )
  {
    return run_and_flush( core_.send_user_input( input, frame ), frame );
  }

  MoshRelaySessionStatus resize( uint32_t columns, uint32_t rows, MoshCoreFrame& frame )
  {
    return run_and_flush( core_.resize( columns, rows, frame ), frame );
  }

  MoshRelaySessionStatus tick( uint64_t now_ms, MoshCoreFrame& frame )
  {
    return run_and_flush( core_.tick( now_ms, frame ), frame );
  }

  MoshRelaySessionStatus shutdown( MoshCoreFrame& frame )
  {
    return run_and_flush( core_.shutdown( frame ), frame );
  }

private:
  MoshRelaySessionStatus run_and_flush( MoshCoreStatus core_status, MoshCoreFrame& frame )
  {
    const MoshRelaySessionStatus mapped = map_core_status( core_status, frame );
    if ( mapped != MoshRelaySessionStatus::Ok ) {
      return mapped;
    }
    return flush_outbound( frame );
  }

  MoshRelaySessionStatus map_core_status( MoshCoreStatus core_status, MoshCoreFrame& frame ) const
  {
    (void)frame;
    if ( core_status == MoshCoreStatus::Ok ) {
      return MoshRelaySessionStatus::Ok;
    }
    return MoshRelaySessionStatus::CoreError;
  }

  MoshRelaySessionStatus flush_outbound( const MoshCoreFrame& frame )
  {
    for ( const PacketBytes& packet : frame.outbound_packets ) {
      if ( relay_.send( packet ) != RelayDatagramStatus::Ok ) {
        return MoshRelaySessionStatus::RelayError;
      }
    }
    return MoshRelaySessionStatus::Ok;
  }

  MoshCoreDriver& core_;
  RelayDatagramEndpoint& relay_;
};

}  // namespace hovvi::mosh

#endif
