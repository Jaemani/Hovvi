class Hovvi < Formula
  desc "Catch and resume remote development sessions from mobile devices"
  homepage "https://github.com/Jaemani/Hovvi"
  url "https://registry.npmjs.org/hovvi/-/hovvi-0.1.0.tgz"
  sha256 "021706b10dcd7802ab548e2655caaf299361d53b24eaa2d960375e2557a560ae"
  license "MIT"

  depends_on "node"
  depends_on "tmux"
  depends_on "mosh"

  def install
    system "npm", "install", *std_npm_install_args
  end

  test do
    assert_match "Hovvi", shell_output("#{bin}/hovvi --help")
  end
end
