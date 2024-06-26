{
  description = "Node.JS dev environment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-23.05";

  outputs = { self, nixpkgs }:
    let
      b = builtins;
      devShell = system: pkgs: {
        default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            bashInteractive
            nodejs_20
          ];
        };
      };
    in
    {
      devShells = b.mapAttrs (devShell) nixpkgs.legacyPackages;
    };
}
