FROM mcr.microsoft.com/devcontainers/rust:2-1-trixie

RUN apt-get update && apt-get install -y ffmpeg mingw-w64

RUN rustup target add x86_64-pc-windows-gnu x86_64-unknown-linux-gnu aarch64-apple-darwin x86_64-apple-darwin
