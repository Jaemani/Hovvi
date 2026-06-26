#ifndef HOVVI_MOSH_CORE_PACKET_IO_H
#define HOVVI_MOSH_CORE_PACKET_IO_H

#include <cstddef>
#include <cstdint>
#include <deque>
#include <vector>

namespace hovvi::mosh {

using PacketBytes = std::vector<uint8_t>;

class PacketEndpoint
{
public:
  PacketEndpoint() : inbox_(), peer_( nullptr ) {}

  bool send( PacketBytes packet )
  {
    if ( peer_ == nullptr ) {
      return false;
    }
    peer_->inbox_.push_back( packet );
    return true;
  }

  bool receive( PacketBytes& out_packet )
  {
    if ( inbox_.empty() ) {
      return false;
    }
    out_packet = inbox_.front();
    inbox_.pop_front();
    return true;
  }

  size_t pending() const { return inbox_.size(); }

private:
  friend class InProcessPacketChannel;

  void connect( PacketEndpoint* peer ) { peer_ = peer; }

  std::deque<PacketBytes> inbox_;
  PacketEndpoint* peer_;
};

class InProcessPacketChannel
{
public:
  InProcessPacketChannel() : client_(), server_()
  {
    client_.connect( &server_ );
    server_.connect( &client_ );
  }

  PacketEndpoint& client() { return client_; }
  PacketEndpoint& server() { return server_; }

private:
  PacketEndpoint client_;
  PacketEndpoint server_;
};

}  // namespace hovvi::mosh

#endif
