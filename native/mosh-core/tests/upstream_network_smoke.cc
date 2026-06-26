#include "src/network/transportfragment.h"
#include "src/protobufs/transportinstruction.pb.h"

#include <iostream>
#include <string>
#include <vector>

int main()
{
  TransportBuffers::Instruction instruction;
  instruction.set_protocol_version( 2 );
  instruction.set_old_num( 10 );
  instruction.set_new_num( 11 );
  instruction.set_ack_num( 7 );
  instruction.set_throwaway_num( 3 );
  instruction.set_diff( std::string( 512, 'x' ) );

  Network::Fragmenter fragmenter;
  std::vector<Network::Fragment> fragments = fragmenter.make_fragments( instruction, Network::Fragment::frag_header_len + 1 );
  if ( fragments.size() < 2 ) {
    std::cerr << "expected multiple fragments\n";
    return 1;
  }

  Network::FragmentAssembly assembly;
  bool complete = false;
  for ( Network::Fragment& fragment : fragments ) {
    Network::Fragment parsed( fragment.tostring() );
    if ( !( parsed == fragment ) ) {
      std::cerr << "fragment serialization mismatch\n";
      return 1;
    }
    complete = assembly.add_fragment( parsed );
  }

  if ( !complete ) {
    std::cerr << "assembly did not complete\n";
    return 1;
  }

  TransportBuffers::Instruction assembled = assembly.get_assembly();
  if ( assembled.protocol_version() != 2 || assembled.old_num() != 10 || assembled.new_num() != 11
       || assembled.ack_num() != 7 || assembled.throwaway_num() != 3 || assembled.diff() != instruction.diff() ) {
    std::cerr << "assembled instruction mismatch\n";
    return 1;
  }

  std::cout << "hovvi upstream mosh network smoke passed\n";
  return 0;
}
