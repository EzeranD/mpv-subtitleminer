use std::io::Result;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[cfg(unix)]
type Inner = tokio::net::UnixStream;

#[cfg(windows)]
type Inner = tokio::net::windows::named_pipe::NamedPipeClient;

pub struct MpvStream {
    reader: BufReader<tokio::io::ReadHalf<Inner>>,
    writer: tokio::io::WriteHalf<Inner>,
}

impl MpvStream {
    pub async fn connect(path: &str) -> Result<Self> {
        let stream = Self::connect_inner(path).await?;
        let (reader, writer) = tokio::io::split(stream);
        Ok(Self {
            reader: BufReader::new(reader),
            writer,
        })
    }

    pub async fn read_line(&mut self, buf: &mut String) -> Result<usize> {
        self.reader.read_line(buf).await
    }

    pub async fn write_all(&mut self, buf: &[u8]) -> Result<()> {
        self.writer.write_all(buf).await
    }

    #[cfg(unix)]
    async fn connect_inner(path: &str) -> Result<Inner> {
        tokio::net::UnixStream::connect(path).await.map_err(|e| {
            std::io::Error::new(
                e.kind(),
                format!("Failed to connect to mpv socket at '{}': {}", path, e),
            )
        })
    }

    #[cfg(windows)]
    async fn connect_inner(path: &str) -> Result<Inner> {
        let pipe_path = if path.starts_with(r"\\.\pipe\") {
            path.to_string()
        } else {
            let name = std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("mpv-socket");
            format!(r"\\.\pipe\{}", name)
        };

        tokio::net::windows::named_pipe::ClientOptions::new()
            .open(&pipe_path)
            .map_err(|e| {
                std::io::Error::new(
                    e.kind(),
                    format!("Failed to connect to mpv pipe at '{}': {}", pipe_path, e),
                )
            })
    }
}
