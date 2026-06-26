#include "src/crypto/crypto.h"

#include <iostream>
#include <string>

int main()
{
  try {
    Crypto::Base64Key key( "AAAAAAAAAAAAAAAAAAAAAA" );
    Crypto::Session sender( key );
    Crypto::Session receiver( key );

    const std::string expected = "hovvi upstream mosh crypto smoke";
    const Crypto::Message plaintext( Crypto::Nonce( 1 ), expected );
    const std::string ciphertext = sender.encrypt( plaintext );
    const Crypto::Message decrypted = receiver.decrypt( ciphertext );

    if ( decrypted.nonce.val() != 1 ) {
      std::cerr << "unexpected nonce\n";
      return 1;
    }
    if ( decrypted.text != expected ) {
      std::cerr << "unexpected plaintext\n";
      return 1;
    }
  } catch ( const std::exception& error ) {
    std::cerr << error.what() << "\n";
    return 1;
  }

  std::cout << "hovvi upstream mosh crypto smoke passed\n";
  return 0;
}
