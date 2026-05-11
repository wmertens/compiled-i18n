{
  description = "Node.JS dev environment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      b = builtins;
      devShell = system: pkgs: {
        default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            bashInteractive
            nodejs_24
          ];
        };
      };
    in
    {
      devShells = b.mapAttrs (devShell) nixpkgs.legacyPackages;
    };
}
