use std::{
    env,
    fs,
    io::{BufRead, BufReader, Write},
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
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
                            if let Err(error) = window.navigate(url.parse().expect("valid local URL")) {
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

    let standalone_dir = resolve_standalone_dir(app)?;
    let start_script = standalone_dir.join("start.js");
    if !start_script.exists() {
        return Err(format!(
            "未找到 Next.js standalone 启动脚本：{}。请先运行 npm run tauri:prepare。",
            start_script.display()
        ));
    }

    let port = pick_port()?;
    let database_url = format!("file:{}", data_dir.join("ose.db").to_string_lossy());

    let node_binary = resolve_node_binary(&standalone_dir);
    let using_bundled = node_binary != PathBuf::from("node");

    let mut cmd = Command::new(&node_binary);
    cmd.arg(&start_script)
        .current_dir(&standalone_dir)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("DATABASE_URL", database_url)
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
        if using_bundled {
            format!(
                "启动打包的 Node.js 失败：{error}。可执行文件位置：{}",
                node_binary.display()
            )
        } else {
            format!("启动 Node.js 失败：{error}。请安装 Node.js 20+ 并加入 PATH，或使用 BUNDLE_NODE=1 重新打包。")
        }
    })?;

    pipe_process_output(child.stdout.take(), "next:stdout");
    pipe_process_output(child.stderr.take(), "next:stderr");

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
        Ok(port)
    } else {
        stop_next_server(app);
        Err("服务器启动超时，请检查 Node.js、Prisma 或端口占用状态。".to_string())
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
        candidates.push(resource_dir.join("resources").join("binaries").join("standalone"));
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("resources").join("binaries").join("standalone"));
            candidates.push(exe_dir.join("binaries").join("standalone"));
        }
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join("resources").join("binaries").join("standalone"));
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

fn pipe_process_output<T>(pipe: Option<T>, label: &'static str)
where
    T: std::io::Read + Send + 'static,
{
    if let Some(pipe) = pipe {
        thread::spawn(move || {
            for line in BufReader::new(pipe).lines().map_while(Result::ok) {
                println!("[{label}] {line}");
            }
        });
    }
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
