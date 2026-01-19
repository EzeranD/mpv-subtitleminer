.PHONY: build-linux build-windows build-site check-all check-linux check-windows check-mac-intel check-mac-arm check-site

check-all: check-windows check-linux check-mac-intel check-mac-arm

build-windows:
	cargo build --target=x86_64-pc-windows-gnu

build-linux:
	cargo build --target=x86_64-unknown-linux-gnu

build-mac-intel:
	cargo build --target=x86_64-apple-darwin

build-mac-arm:
	cargo build --target=aarch64-apple-darwin

build-site:
	npm --prefix page run build

check-windows:
	cargo check --target=x86_64-pc-windows-gnu

check-linux:
	cargo check --target=x86_64-unknown-linux-gnu

check-mac-intel:
	cargo check --target=x86_64-apple-darwin

check-mac-arm:
	cargo check --target=aarch64-apple-darwin

check-site:
	npm --prefix page run lint
	npm --prefix page run format
