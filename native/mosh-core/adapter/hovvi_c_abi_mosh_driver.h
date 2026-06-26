#ifndef HOVVI_MOSH_CORE_C_ABI_DRIVER_H
#define HOVVI_MOSH_CORE_C_ABI_DRIVER_H

#include <cstdint>

#include "hovvi_mosh_core.h"
#include "hovvi_mosh_relay_session.h"

namespace hovvi::mosh {

struct CAbiMoshCoreFunctions
{
  hovvi_mosh_status_t ( *create )( const char* printable_key,
                                   hovvi_mosh_terminal_size_t initial_size,
                                   hovvi_mosh_core_t** out_core );
  hovvi_mosh_status_t ( *receive_packet )( hovvi_mosh_core_t* core,
                                           hovvi_mosh_bytes_t packet,
                                           hovvi_mosh_frame_t* out_frame );
  hovvi_mosh_status_t ( *send_user_input )( hovvi_mosh_core_t* core,
                                            hovvi_mosh_bytes_t input,
                                            hovvi_mosh_frame_t* out_frame );
  hovvi_mosh_status_t ( *resize )( hovvi_mosh_core_t* core,
                                   hovvi_mosh_terminal_size_t size,
                                   hovvi_mosh_frame_t* out_frame );
  hovvi_mosh_status_t ( *tick )( hovvi_mosh_core_t* core, uint64_t now_ms, hovvi_mosh_frame_t* out_frame );
  hovvi_mosh_status_t ( *shutdown )( hovvi_mosh_core_t* core, hovvi_mosh_frame_t* out_frame );
  void ( *frame_free )( hovvi_mosh_frame_t* frame );
  void ( *destroy )( hovvi_mosh_core_t* core );
};

inline CAbiMoshCoreFunctions default_c_abi_mosh_core_functions()
{
  return CAbiMoshCoreFunctions {
    hovvi_mosh_core_create,
    hovvi_mosh_core_receive_packet,
    hovvi_mosh_core_send_user_input,
    hovvi_mosh_core_resize,
    hovvi_mosh_core_tick,
    hovvi_mosh_core_shutdown,
    hovvi_mosh_frame_free,
    hovvi_mosh_core_destroy,
  };
}

class CAbiMoshCoreDriver final : public MoshCoreDriver
{
public:
  CAbiMoshCoreDriver( hovvi_mosh_core_t* core, CAbiMoshCoreFunctions functions )
    : core_( core ), functions_( functions ), owns_core_( false )
  {}

  CAbiMoshCoreDriver( const char* printable_key,
                      uint32_t columns,
                      uint32_t rows,
                      CAbiMoshCoreFunctions functions = default_c_abi_mosh_core_functions() )
    : core_( nullptr ), functions_( functions ), owns_core_( true )
  {
    if ( functions_.create != nullptr ) {
      const hovvi_mosh_terminal_size_t size = { columns, rows };
      const hovvi_mosh_status_t status = functions_.create( printable_key, size, &core_ );
      if ( status != HOVVI_MOSH_OK ) {
        core_ = nullptr;
        create_status_ = map_status( status );
      }
    } else {
      create_status_ = MoshCoreStatus::InvalidArgument;
    }
  }

  ~CAbiMoshCoreDriver() override
  {
    if ( owns_core_ && core_ != nullptr && functions_.destroy != nullptr ) {
      functions_.destroy( core_ );
    }
  }

  CAbiMoshCoreDriver( const CAbiMoshCoreDriver& ) = delete;
  CAbiMoshCoreDriver& operator=( const CAbiMoshCoreDriver& ) = delete;

  CAbiMoshCoreDriver( CAbiMoshCoreDriver&& other ) noexcept
    : core_( other.core_ ),
      functions_( other.functions_ ),
      owns_core_( other.owns_core_ ),
      create_status_( other.create_status_ )
  {
    other.core_ = nullptr;
    other.owns_core_ = false;
  }

  CAbiMoshCoreDriver& operator=( CAbiMoshCoreDriver&& other ) noexcept
  {
    if ( this == &other ) {
      return *this;
    }
    if ( owns_core_ && core_ != nullptr && functions_.destroy != nullptr ) {
      functions_.destroy( core_ );
    }
    core_ = other.core_;
    functions_ = other.functions_;
    owns_core_ = other.owns_core_;
    create_status_ = other.create_status_;
    other.core_ = nullptr;
    other.owns_core_ = false;
    return *this;
  }

  bool available() const { return core_ != nullptr && create_status_ == MoshCoreStatus::Ok; }
  MoshCoreStatus create_status() const { return create_status_; }
  hovvi_mosh_core_t* core() const { return core_; }

  MoshCoreStatus receive_packet( const PacketBytes& packet, MoshCoreFrame& frame ) override
  {
    if ( !available() || functions_.receive_packet == nullptr ) {
      return create_status_;
    }
    return run_with_frame( functions_.receive_packet( core_, to_bytes( packet ), &abi_frame_ ), frame );
  }

  MoshCoreStatus send_user_input( const PacketBytes& input, MoshCoreFrame& frame ) override
  {
    if ( !available() || functions_.send_user_input == nullptr ) {
      return create_status_;
    }
    return run_with_frame( functions_.send_user_input( core_, to_bytes( input ), &abi_frame_ ), frame );
  }

  MoshCoreStatus resize( uint32_t columns, uint32_t rows, MoshCoreFrame& frame ) override
  {
    if ( !available() || functions_.resize == nullptr ) {
      return create_status_;
    }
    const hovvi_mosh_terminal_size_t size = { columns, rows };
    return run_with_frame( functions_.resize( core_, size, &abi_frame_ ), frame );
  }

  MoshCoreStatus tick( uint64_t now_ms, MoshCoreFrame& frame ) override
  {
    if ( !available() || functions_.tick == nullptr ) {
      return create_status_;
    }
    return run_with_frame( functions_.tick( core_, now_ms, &abi_frame_ ), frame );
  }

  MoshCoreStatus shutdown( MoshCoreFrame& frame ) override
  {
    if ( !available() || functions_.shutdown == nullptr ) {
      return create_status_;
    }
    return run_with_frame( functions_.shutdown( core_, &abi_frame_ ), frame );
  }

private:
  MoshCoreStatus run_with_frame( hovvi_mosh_status_t status, MoshCoreFrame& frame )
  {
    frame = MoshCoreFrame {};
    copy_frame( abi_frame_, frame );
    if ( functions_.frame_free != nullptr ) {
      functions_.frame_free( &abi_frame_ );
    }
    return map_status( status );
  }

  static hovvi_mosh_bytes_t to_bytes( const PacketBytes& bytes )
  {
    return hovvi_mosh_bytes_t { bytes.empty() ? nullptr : bytes.data(), bytes.size() };
  }

  static void copy_frame( const hovvi_mosh_frame_t& source, MoshCoreFrame& target )
  {
    if ( source.terminal_output.data != nullptr && source.terminal_output.len > 0 ) {
      target.terminal_output.assign( source.terminal_output.data,
                                     source.terminal_output.data + source.terminal_output.len );
    }
    for ( size_t i = 0; i < source.outbound_packet_count; i++ ) {
      const hovvi_mosh_bytes_t& packet = source.outbound_packets[i];
      if ( packet.data == nullptr || packet.len == 0 ) {
        target.outbound_packets.push_back( PacketBytes {} );
      } else {
        target.outbound_packets.emplace_back( packet.data, packet.data + packet.len );
      }
    }
    target.next_tick_ms = source.next_tick_ms;
    target.clean_shutdown = source.clean_shutdown != 0;
  }

  static MoshCoreStatus map_status( hovvi_mosh_status_t status )
  {
    switch ( status ) {
      case HOVVI_MOSH_OK:
        return MoshCoreStatus::Ok;
      case HOVVI_MOSH_INVALID_ARGUMENT:
        return MoshCoreStatus::InvalidArgument;
      case HOVVI_MOSH_CRYPTO_ERROR:
        return MoshCoreStatus::CryptoError;
      case HOVVI_MOSH_PROTOCOL_ERROR:
        return MoshCoreStatus::ProtocolError;
      case HOVVI_MOSH_INTERNAL_ERROR:
        return MoshCoreStatus::InternalError;
      case HOVVI_MOSH_UNAVAILABLE:
        return MoshCoreStatus::Unavailable;
      default:
        return MoshCoreStatus::InternalError;
    }
  }

  hovvi_mosh_core_t* core_;
  CAbiMoshCoreFunctions functions_;
  bool owns_core_;
  MoshCoreStatus create_status_ = MoshCoreStatus::Ok;
  hovvi_mosh_frame_t abi_frame_ = {};
};

}  // namespace hovvi::mosh

#endif
