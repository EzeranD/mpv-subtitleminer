{
  description = "Language-learning toolkit for mpv: stream subtitles to a web UI and create Anki cards";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs @ {
    self,
    flake-parts,
    ...
  }:
    flake-parts.lib.mkFlake {inherit inputs;} {
      systems = ["x86_64-linux"];

      perSystem = {pkgs, ...}: let
        web = pkgs.buildNpmPackage {
          pname = "mpv-subtitleminer-web";
          version = "0.1.2";

          src = pkgs.lib.cleanSource ./page;
          npmDepsHash = "sha256-ubIOn41e0awOd0OaFRB5VpwXBvVcSzXleCKIGThCBCQ=";

          installPhase = ''
            runHook preInstall
            mkdir -p $out/share/mpv-subtitleminer/web
            cp dist/index.html $out/share/mpv-subtitleminer/web/index.html
            runHook postInstall
          '';
        };
      in {
        formatter = pkgs.alejandra;

        packages.default = pkgs.rustPlatform.buildRustPackage {
          pname = "mpv-subtitleminer";
          version = "0.1.2";

          src = pkgs.lib.cleanSource ./.;
          cargoLock.lockFile = ./Cargo.lock;

          nativeBuildInputs = [pkgs.pkg-config];
          buildInputs = [pkgs.openssl];

          postInstall = ''
            mkdir -p $out/share/mpv-subtitleminer/web
            mkdir -p $out/share/mpv/scripts

            # Install the web interface from the web package
            install -m 444 "${web}/share/mpv-subtitleminer/web/index.html" "$out/share/mpv-subtitleminer/web/index.html"

            # Install the lua script
            install -m 444 mpv/mpv-subtitleminer.lua "$out/share/mpv/scripts/mpv-subtitleminer.lua"

            # Patch the lua script to point to the binary
            substituteInPlace "$out/share/mpv/scripts/mpv-subtitleminer.lua" \
              --replace 'local binary_path = utils.join_path(config_folder_path, binary_name)' \
                        'local binary_path = "'$out'/bin/mpv-subtitleminer"'
          '';

          passthru.scriptName = "mpv-subtitleminer.lua";

          meta = with pkgs.lib; {
            description = "Language-learning toolkit for mpv: stream subtitles to a web UI and create Anki cards";
            homepage = "https://github.com/EzeranD/mpv-subtitleminer";
            license = licenses.gpl3Only;
            platforms = platforms.linux;
            mainProgram = "mpv-subtitleminer";
          };
        };

        devShells.default = pkgs.mkShell {
          nativeBuildInputs = [
            pkgs.pkg-config
          ];
          buildInputs = [
            pkgs.cargo
            pkgs.rustc
            pkgs.rust-analyzer
            pkgs.openssl
            pkgs.nodejs
          ];

          RUST_SRC_PATH = "${pkgs.rust.packages.stable.rustPlatform.rustLibSrc}";
        };
      };

      flake = {
        homeManagerModules.default = {
          pkgs,
          config,
          lib,
          ...
        }: {
          config = lib.mkIf config.programs.mpv.enable {
            programs.mpv.scripts = [self.packages.${pkgs.system}.default];
            xdg.configFile."mpv/index.html".source = "${self.packages.${pkgs.system}.default}/share/mpv-subtitleminer/web/index.html";
          };
        };
      };
    };
}
