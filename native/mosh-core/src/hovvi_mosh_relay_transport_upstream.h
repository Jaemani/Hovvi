#ifndef HOVVI_MOSH_RELAY_TRANSPORT_UPSTREAM_H
#define HOVVI_MOSH_RELAY_TRANSPORT_UPSTREAM_H

#include "hovvi_relay_datagram.h"

#include "src/crypto/crypto.h"
#include "src/network/network.h"
#include "src/network/transportfragment.h"
#include "src/protobufs/transportinstruction.pb.h"
#include "src/statesync/completeterminal.h"
#include "src/statesync/user.h"
#include "src/terminal/terminaldisplay.h"
#include "src/terminal/terminalframebuffer.h"

#include <cstdint>
#include <string>

namespace hovvi::mosh::upstream {

enum class RelayTransportStatus
{
  Ok,
  Empty,
  RelayError,
  CryptoError,
  ProtocolError
};

struct RelayTransportFrame
{
  std::string terminal_output;
  uint64_t remote_state_num = 0;
  uint64_t ack_num = 0;
};

class RelayTransportClient
{
public:
  RelayTransportClient( const char* printable_key,
                        hovvi::mosh::RelayDatagramEndpoint& relay,
                        uint32_t columns,
                        uint32_t rows,
                        size_t mtu = 1200 )
    : relay_( relay ),
      key_( printable_key ),
      inbound_( key_ ),
      outbound_( key_ ),
      remote_terminal_( columns, rows ),
      rendered_frame_( columns, rows ),
      display_( false ),
      rendered_once_( false ),
      mtu_( mtu ),
      sent_state_num_( 0 ),
      received_state_num_( 0 )
  {}

  RelayTransportStatus send_user_input( const std::string& input )
  {
    Network::UserStream stream;
    for ( const unsigned char ch : input ) {
      stream.push_back( Parser::UserByte( ch ) );
    }
    return send_diff( stream.init_diff() );
  }

  RelayTransportStatus send_resize( uint32_t columns, uint32_t rows )
  {
    Network::UserStream stream;
    stream.push_back( Parser::Resize( columns, rows ) );
    return send_diff( stream.init_diff() );
  }

  RelayTransportStatus pump_inbound( RelayTransportFrame& frame )
  {
    hovvi::mosh::PacketBytes datagram;
    const RelayDatagramStatus relay_status = relay_.receive( datagram );
    if ( relay_status == RelayDatagramStatus::Empty ) {
      return RelayTransportStatus::Empty;
    }
    if ( relay_status != RelayDatagramStatus::Ok ) {
      return RelayTransportStatus::RelayError;
    }
    return receive_datagram( datagram, frame );
  }

  uint64_t sent_state_num() const { return sent_state_num_; }
  uint64_t received_state_num() const { return received_state_num_; }

private:
  RelayTransportStatus send_diff( const std::string& diff )
  {
    TransportBuffers::Instruction instruction;
    instruction.set_protocol_version( Network::MOSH_PROTOCOL_VERSION );
    instruction.set_old_num( sent_state_num_ );
    instruction.set_new_num( sent_state_num_ + 1 );
    instruction.set_ack_num( received_state_num_ );
    instruction.set_throwaway_num( sent_state_num_ );
    instruction.set_diff( diff );

    const size_t payload_mtu = mtu_ - Network::Connection::ADDED_BYTES - Crypto::Session::ADDED_BYTES;
    std::vector<Network::Fragment> fragments = fragmenter_.make_fragments( instruction, payload_mtu );
    for ( Network::Fragment& fragment : fragments ) {
      Network::Packet packet( Network::TO_SERVER, Network::timestamp16(), static_cast<uint16_t>( -1 ), fragment.tostring() );
      const std::string encrypted = outbound_.encrypt( packet.toMessage() );
      const hovvi::mosh::PacketBytes bytes( encrypted.begin(), encrypted.end() );
      if ( relay_.send( bytes ) != RelayDatagramStatus::Ok ) {
        return RelayTransportStatus::RelayError;
      }
    }

    sent_state_num_++;
    return RelayTransportStatus::Ok;
  }

  RelayTransportStatus receive_datagram( const hovvi::mosh::PacketBytes& datagram, RelayTransportFrame& frame )
  {
    frame = RelayTransportFrame {};
    try {
      const std::string encrypted( datagram.begin(), datagram.end() );
      const Crypto::Message message = inbound_.decrypt( encrypted );
      const Network::Packet packet( message );
      if ( packet.direction != Network::TO_CLIENT ) {
        return RelayTransportStatus::ProtocolError;
      }

      Network::Fragment fragment( packet.payload );
      if ( !assembly_.add_fragment( fragment ) ) {
        return RelayTransportStatus::Ok;
      }

      TransportBuffers::Instruction instruction = assembly_.get_assembly();
      if ( instruction.protocol_version() != Network::MOSH_PROTOCOL_VERSION ) {
        return RelayTransportStatus::ProtocolError;
      }

      received_state_num_ = instruction.new_num();
      remote_terminal_.apply_string( instruction.diff() );
      const Terminal::Framebuffer& next_frame = remote_terminal_.get_fb();
      frame.terminal_output = display_.new_frame( rendered_once_, rendered_frame_, next_frame );
      rendered_frame_ = next_frame;
      rendered_once_ = true;
      frame.remote_state_num = received_state_num_;
      frame.ack_num = instruction.ack_num();
      return RelayTransportStatus::Ok;
    } catch ( const Crypto::CryptoException& ) {
      return RelayTransportStatus::CryptoError;
    } catch ( const Network::NetworkException& ) {
      return RelayTransportStatus::ProtocolError;
    } catch ( const std::exception& ) {
      return RelayTransportStatus::ProtocolError;
    }
  }

  hovvi::mosh::RelayDatagramEndpoint& relay_;
  Crypto::Base64Key key_;
  Crypto::Session inbound_;
  Crypto::Session outbound_;
  Terminal::Complete remote_terminal_;
  Terminal::Framebuffer rendered_frame_;
  Terminal::Display display_;
  bool rendered_once_;
  size_t mtu_;
  uint64_t sent_state_num_;
  uint64_t received_state_num_;
  Network::Fragmenter fragmenter_;
  Network::FragmentAssembly assembly_;
};

}  // namespace hovvi::mosh::upstream

#endif
