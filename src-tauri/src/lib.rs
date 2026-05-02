use base64::Engine as _;
use std::{
    env, fs,
    io::{BufRead, BufReader, Write},
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Manager, State, WebviewWindow, WindowEvent};

#[derive(Default)]
struct ServerRuntime {
    child: Option<Child>,
    port: Option<u16>,
    data_dir: Option<PathBuf>,
}

#[derive(Default)]
struct ServerState(Mutex<ServerRuntime>);

#[tauri::command]
fn get_server_port(state: State<'_, ServerState>) -> Option<u16> {
    state.0.lock().ok().and_then(|runtime| runtime.port)
}

#[tauri::command]
fn get_data_dir(app: AppHandle) -> Result<String, String> {
    resolve_data_dir(&app).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn restart_server(app: AppHandle) -> Result<u16, String> {
    start_next_server(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(ServerState::default())
        .invoke_handler(tauri::generate_handler![
            get_server_port,
            get_data_dir,
            restart_server
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let close_handle = app.handle().clone();

                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        stop_next_server(&close_handle);
                    }
                });

                #[cfg(mobile)]
                if let Some(url) = option_env!("OSE_MOBILE_URL")
                    .or(option_env!("NEXT_PUBLIC_OSE_MOBILE_URL"))
                    .filter(|value| !value.is_empty())
                {
                    if let Err(error) = window.navigate(url.parse().expect("valid mobile URL")) {
                        show_error_page(&window, &format!("加载移动端服务失败：{error}"));
                    }
                }

                #[cfg(not(mobile))]
                let app_handle = app.handle().clone();
                #[cfg(not(debug_assertions))]
                #[cfg(not(mobile))]
                thread::spawn(move || {
                    let result = start_next_server(&app_handle);
                    // Navigate and eval must happen on the main thread. On Windows
                    // (WebView2) calling them from a background thread fails silently,
                    // leaving the window stuck on the "Starting OSE..." placeholder.
                    let _ = app_handle.run_on_main_thread(move || match result {
                        Ok(port) => {
                            let url = format!("http://127.0.0.1:{port}");
                            if let Err(error) =
                                window.navigate(url.parse().expect("valid local URL"))
                            {
                                show_error_page(&window, &format!("加载桌面服务失败：{error}"));
                            }
                        }
                        Err(error) => show_error_page(&window, &error),
                    });
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OSE desktop app");
}

fn start_next_server(app: &AppHandle) -> Result<u16, String> {
    stop_next_server(app);

    let data_dir = resolve_data_dir(app)?;
    fs::create_dir_all(&data_dir).map_err(|error| format!("创建数据目录失败：{error}"))?;

    let log_path = data_dir.join("startup.log");
    let log: Option<Arc<Mutex<fs::File>>> = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok()
        .map(|f| Arc::new(Mutex::new(f)));

    let standalone_dir = resolve_standalone_dir(app)?;
    let start_script = standalone_dir.join("start.js");
    if !start_script.exists() {
        return Err(format!(
            "未找到 Next.js standalone 启动脚本：{}。请先运行 npm run tauri:prepare。",
            start_script.display()
        ));
    }

    let auth_secret = resolve_or_create_auth_secret(&data_dir)?;
    let port = pick_port()?;
    let database_path = data_dir.join("ose.db");
    let database_url = format!("file:{}", database_path.to_string_lossy());
    let node_binary = resolve_node_binary(&standalone_dir);
    let using_bundled = node_binary != PathBuf::from("node");

    write_startup_header(
        log.as_ref(),
        &standalone_dir,
        &node_binary,
        using_bundled,
        port,
        &database_path,
        &log_path,
    );

    let mut cmd = Command::new(&node_binary);
    cmd.arg(&start_script)
        .current_dir(&standalone_dir)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("DATABASE_URL", database_url)
        .env("AUTH_SECRET", &auth_secret)
        .env("NEXTAUTH_SECRET", &auth_secret)
        .env("AUTH_URL", format!("http://127.0.0.1:{port}"))
        .env("NEXTAUTH_URL", format!("http://127.0.0.1:{port}"))
        .env("NODE_ENV", "production")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Prevent a black console window from appearing on Windows. The main app
    // binary uses windows_subsystem = "windows", so spawned child processes
    // would otherwise get a new console window allocated automatically.
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn().map_err(|error| {
        let msg = if using_bundled {
            format!(
                "启动打包的 Node.js 失败：{error}。可执行文件位置：{}",
                node_binary.display()
            )
        } else {
            format!("启动 Node.js 失败：{error}。请安装 Node.js 20+ 并加入 PATH，或使用 BUNDLE_NODE=1 重新打包。")
        };
        log_line(log.as_ref(), &format!("[startup] spawn error: {msg}"));
        msg
    })?;

    pipe_process_output(child.stdout.take(), "next:stdout", log.clone());
    pipe_process_output(child.stderr.take(), "next:stderr", log.clone());

    {
        let state = app.state::<ServerState>();
        let mut runtime = state
            .0
            .lock()
            .map_err(|_| "服务器状态锁定失败".to_string())?;
        runtime.child = Some(child);
        runtime.port = Some(port);
        runtime.data_dir = Some(data_dir);
    }

    if wait_until_ready(port, Duration::from_secs(60)) {
        log_line(log.as_ref(), "[startup] server ready");
        Ok(port)
    } else {
        stop_next_server(app);
        let msg = format!(
            "服务器启动超时，请检查 Node.js、Prisma 或端口占用状态。启动日志：{}",
            log_path.display()
        );
        log_line(
            log.as_ref(),
            "[startup] timeout: server did not become ready within 60s",
        );
        Err(msg)
    }
}

fn stop_next_server(app: &AppHandle) {
    let state = app.state::<ServerState>();
    let Ok(mut runtime) = state.0.lock() else {
        return;
    };

    if let Some(mut child) = runtime.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    runtime.port = None;
}

fn log_line(log: Option<&Arc<Mutex<fs::File>>>, message: &str) {
    if let Some(log) = log {
        if let Ok(mut f) = log.lock() {
            let _ = writeln!(f, "{message}");
        }
    }
}

fn write_startup_header(
    log: Option<&Arc<Mutex<fs::File>>>,
    standalone_dir: &PathBuf,
    node_binary: &PathBuf,
    using_bundled: bool,
    port: u16,
    database_path: &PathBuf,
    log_path: &PathBuf,
) {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    log_line(log, &format!("=== OSE startup (unix={ts}) ==="));
    log_line(log, &format!("log:          {}", log_path.display()));
    log_line(log, &format!("standalone:   {}", standalone_dir.display()));
    log_line(
        log,
        &format!(
            "node:         {} (bundled={})",
            node_binary.display(),
            using_bundled
        ),
    );
    log_line(log, &format!("port:         {port}"));
    log_line(log, &format!("database:     {}", database_path.display()));
}

fn resolve_node_binary(standalone_dir: &PathBuf) -> PathBuf {
    let runtime_dir = standalone_dir.join("runtime");
    let bundled = if cfg!(windows) {
        runtime_dir.join("node.exe")
    } else {
        runtime_dir.join("node")
    };
    if bundled.exists() {
        bundled
    } else {
        PathBuf::from("node")
    }
}

fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("获取用户数据目录失败：{error}"))
}

fn resolve_standalone_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join("standalone"));
        candidates.push(
            resource_dir
                .join("resources")
                .join("binaries")
                .join("standalone"),
        );
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(
                exe_dir
                    .join("resources")
                    .join("binaries")
                    .join("standalone"),
            );
            candidates.push(exe_dir.join("binaries").join("standalone"));
        }
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(
            current_dir
                .join("resources")
                .join("binaries")
                .join("standalone"),
        );
        candidates.push(current_dir.join("binaries").join("standalone"));
    }

    for path in &candidates {
        if path.join("start.js").exists() {
            return Ok(path.clone());
        }
    }

    let checked = candidates
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join("；");
    Err(format!("获取 standalone 目录失败，已检查：{checked}"))
}

fn pick_port() -> Result<u16, String> {
    for _ in 0..10 {
        if let Some(port) = portpicker::pick_unused_port() {
            return Ok(port);
        }
    }
    Err("无法找到可用端口".to_string())
}

fn wait_until_ready(port: u16, timeout: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if health_check(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(300));
    }
    false
}

fn health_check(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = "GET /api/ai/status HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut first_line = String::new();
    BufReader::new(stream).read_line(&mut first_line).is_ok() && first_line.contains("200")
}

fn pipe_process_output<T>(pipe: Option<T>, label: &'static str, log: Option<Arc<Mutex<fs::File>>>)
where
    T: std::io::Read + Send + 'static,
{
    if let Some(pipe) = pipe {
        thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                println!("[{label}] {line}");
                if let Some(ref log) = log {
                    if let Ok(mut f) = log.lock() {
                        let _ = writeln!(f, "[{label}] {line}");
                    }
                }
            }
        });
    }
}

fn resolve_or_create_auth_secret(data_dir: &PathBuf) -> Result<String, String> {
    let secret_path = data_dir.join("auth.secret");

    if secret_path.exists() {
        let content = fs::read_to_string(&secret_path)
            .map_err(|e| format!("读取 auth.secret 失败：{e}"))?;
        let trimmed = content.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
        // Empty file — fall through and generate a fresh secret.
    }

    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| format!("生成随机 secret 失败：{e}"))?;
    let secret = base64::engine::general_purpose::STANDARD.encode(bytes);
    write_secret_atomic(&secret_path, &secret)?;
    Ok(secret)
}

#[cfg(unix)]
fn create_secret_file(path: &std::path::Path) -> Result<fs::File, std::io::Error> {
    use std::os::unix::fs::OpenOptionsExt;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
}

#[cfg(not(unix))]
fn create_secret_file(path: &std::path::Path) -> Result<fs::File, std::io::Error> {
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
}

fn write_secret_atomic(secret_path: &PathBuf, secret: &str) -> Result<(), String> {
    let tmp_path = secret_path.with_file_name("auth.secret.tmp");
    // Remove any leftover temp file so create_new(true) can succeed.
    let _ = fs::remove_file(&tmp_path);
    let mut file = create_secret_file(&tmp_path)
        .map_err(|e| format!("创建临时 secret 文件失败：{e}"))?;
    file.write_all(secret.as_bytes())
        .map_err(|e| format!("写入 secret 失败：{e}"))?;
    drop(file);
    fs::rename(&tmp_path, secret_path).map_err(|e| format!("移动 secret 文件失败：{e}"))
}

fn show_error_page(window: &WebviewWindow, message: &str) {
    let escaped = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\\', "&#92;")
        .replace('`', "&#96;");
    let script = format!(
        "document.body.innerHTML = `<main style=\"font-family: system-ui; padding: 40px; line-height: 1.7\"><h1>OSE 桌面服务启动失败</h1><p>{escaped}</p></main>`;"
    );
    let _ = window.eval(&script);
}
