mod event_loop;
mod media;
mod mpv_stream;

use clap::Parser;
use event_loop::run_server;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Path to the mpv IPC socket
    #[cfg_attr(unix, arg(default_value = "/tmp/mpv-socket"))]
    #[cfg_attr(windows, arg(default_value = r"\\.\pipe\mpv-socket"))]
    socket_path: String,

    /// WebSocket server port
    #[arg(default_value_t = 61777)]
    port: u16,

    /// Path to ffmpeg binary
    #[arg(default_value = "ffmpeg")]
    ffmpeg_path: String,

    /// Validate that the IPC socket belongs to this mpv PID
    #[arg(long)]
    expected_mpv_pid: Option<u32>,
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args = Args::parse();

    media::init_ffmpeg_path(&args.ffmpeg_path);
    log::info!("Using ffmpeg: {}", args.ffmpeg_path);

    if let Err(e) = run_server(&args.socket_path, args.port, args.expected_mpv_pid).await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
